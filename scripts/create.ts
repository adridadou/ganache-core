// TODO: make this its own package?

import chalk from "chalk";
import yargs from "yargs";
import prettier from "prettier";
import camelCase from "camelcase";
import npa from "npm-package-arg";
import userName from "git-user-name";
import { join, resolve } from "path";
import { version } from "../lerna.json";
import { highlight } from "cli-highlight";
import { mkdir, mkdirSync, writeFile } from "fs-extra";
import { lstatSync as lstat, readdirSync as readDir, readFileSync as readFile } from "fs";

const isDir = (s: string) => lstat(s).isDirectory();
const getDirectories = (s: string) => readDir(s).filter(n => isDir(join(s, n)));

const COLORS = {
  Bold: "\x1b[1m",
  Reset: "\x1b[0m",
  FgRed: "\x1b[31m"
};

const scopes = getDirectories(join(__dirname, "../src"));
const argv = yargs
  .command(`$0 <name> --location`, `Create a new package in the given location with the provided name.`, yargs => {
    return yargs
      .usage(
        chalk`{hex("#e4a663").bold Create a new package in the given location with the provided name.}\n\n` +
          chalk`{bold Usage}\n  {bold $} {dim <}name{dim >} {dim --}location {dim <}${scopes.join(
            chalk.dim(" | ")
          )}{dim >}`
      )
      .positional("<name>", {
        describe: `        The name of the new package`,
        type: "string",
        demandOption: true
      })
      .alias("name", "<name>")
      .option("location", {
        alias: "l",
        default: "packages",
        describe: `The location for the new package.`,
        choices: scopes,
        type: "string",
        demandOption: true
      });
  })
  .demandCommand()
  .version(false)
  .help(false)
  .updateStrings({
    "Positionals:": chalk.bold("Options"),
    "Options:": ` `,
    "Not enough non-option arguments: got %s, need at least %s": {
      one: chalk`{red {bold ERROR! Not enough non-option arguments:}\n  got %s, need at least %s}`,
      other: chalk`{red {bold ERROR! Not enough non-option arguments:}\n  got %s, need at least %s}`
    } as any,
    "Invalid values:": `${COLORS.FgRed}${COLORS.Bold}ERROR! Invalid values:${COLORS.Reset}${COLORS.FgRed}`
  })
  .fail((msg, err, yargs) => {
    // we use a custom `fail` fn so that NPM doesn't print its own giant error message.
    if (err) throw err;

    console.error(yargs.help().toString().replace("\n\n\n", "\n"));
    console.error();
    console.error(msg);
    process.exit(0);
  }).argv;
process.stdout.write(`${COLORS.Reset}`);

(async function () {
  let name = argv.name;
  let location = argv.location;

  try {
    const workspaceDir = join(__dirname, "../");
    const LICENSE = readFile(join(workspaceDir, "LICENSE"), "utf-8");

    const prettierConfig = await prettier.resolveConfig(process.cwd());

    name = npa(name).name;

    const packageName = `@ganache/${name}`;
    let packageAuthor = userName();

    const pkg = {
      name: packageName,
      version: version,
      author: packageAuthor || require("../package.json").author,
      homepage: "https://github.com/trufflesuite/ganache-core#readme",
      license: "MIT",
      main: "lib/index.js",
      types: "src/index.ts",
      directories: {
        lib: "lib",
        test: "__tests__"
      },
      files: ["lib"],
      repository: {
        type: "git",
        url: "git+https://github.com/trufflesuite/ganache-core.git"
      },
      scripts: {
        tsc: "ts-node ../../../scripts/compile",
        test: "nyc npm run mocha",
        mocha:
          "cross-env TS_NODE_FILES=true mocha --exit --check-leaks --throw-deprecation --trace-warnings --require ts-node/register '__tests__/**/*.test.ts'"
      },
      bugs: {
        url: "https://github.com/trufflesuite/ganache-core/issues"
      }
    };

    const tsConfig = {
      extends: "../../../tsconfig.json",
      compilerOptions: {
        outDir: "lib"
      },
      include: ["src"]
    };

    const shrinkwrap = {
      name: packageName,
      version: version,
      lockfileVersion: 1
    };

    const testFile = `import assert from "assert";
import ${camelCase(name)} from "../src/";

describe("${packageName}", () => {
  it("needs tests");
})`;

    const indexFile = `export default {
  // TODO
}
`;

    const rootIndexFile = `// ************************************************************************* //
// This file is necessary to "trick" typescript into using our ./src/**/*.ts //
//            files when developing, debugging, and running tests            //
// ************************************************************************* //
export * from "./src/index";
`;

    const dir = join(workspaceDir, "src", location, name);
    const tests = join(dir, "__tests__");
    const src = join(dir, "src");

    function initSrc() {
      return writeFile(join(src, "index.ts"), prettier.format(indexFile, { ...prettierConfig, parser: "typescript" }));
    }

    function initRootIndex() {
      return Promise.all([
        writeFile(
          join(dir, ".npmignore"),
          `./index.ts
__tests__
.nyc_output
coverage
scripts
src
tsconfig.json
typedoc.json
`
        ),
        writeFile(
          join(dir, "index.ts"),
          prettier.format(rootIndexFile, {
            ...prettierConfig,
            parser: "typescript"
          })
        ),
        writeFile(join(dir, "LICENSE"), LICENSE)
      ]);
    }

    function initTests() {
      return writeFile(
        join(tests, "index.test.ts"),
        prettier.format(testFile, { ...prettierConfig, parser: "typescript" })
      );
    }

    const pkgStr = JSON.stringify(pkg, null, 2) + "\n";
    const pkgPath = join(dir, "package.json");

    console.log(`About to write to ${resolve(__dirname, pkgPath)}`);
    console.log("");

    mkdirSync(dir);

    await Promise.all([
      initRootIndex(),
      mkdir(tests).then(initTests),
      mkdir(src).then(initSrc),
      writeFile(join(dir, "tsconfig.json"), JSON.stringify(tsConfig, null, 2) + "\n"),
      writeFile(
        join(dir, "README.md"),
        prettier.format(`# ${packageName}\n> TODO: description`, {
          ...prettierConfig,
          parser: "markdown"
        })
      ),
      writeFile(pkgPath, pkgStr),
      writeFile(join(dir, "npm-shrinkwrap.json"), JSON.stringify(shrinkwrap) + "\n")
    ]);

    console.log(
      highlight(pkgStr, {
        language: "json",
        theme: {
          attr: chalk.hex("#3FE0C5"),
          string: chalk.hex("#e4a663")
        }
      })
    );

    console.log(
      chalk`{green success} {magenta create} New package {bgBlack  ${name} } created. New package created at ./src/packages/${name}.\n\n  package.json: {bold ${dir}/package.json}`
    );
  } catch (e) {
    console.error(e);
    console.log("");
    console.log(chalk`{red fail} {magenta create} New package {bgBlack  ${name} } not created. See error above.`);
  }
})();
