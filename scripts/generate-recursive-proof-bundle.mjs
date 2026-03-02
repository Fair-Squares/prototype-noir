#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function resolveExecutable(envName, fallbacks, commandName) {
  const fromEnv = process.env[envName];
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  for (const candidate of fallbacks) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  const which = spawnSync("bash", ["-lc", `command -v ${commandName}`], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (which.status === 0 && which.stdout.trim()) {
    return which.stdout.trim();
  }

  throw new Error(
    `Could not find ${commandName}. Set ${envName}=<binary-path> or install ${commandName} in PATH.`
  );
}

const NARGO_BIN = resolveExecutable(
  "NARGO_BIN",
  ["/usr/src/noir/noir-repo/target/release/nargo"],
  "nargo"
);
const BB_BIN = resolveExecutable(
  "BB_BIN",
  ["/usr/src/barretenberg/cpp/build/bin/bb-avm", "/usr/src/barretenberg/cpp/build/bin/bb"],
  "bb"
);

const CIRCUITS = {
  "fsft-holder": {
    packageName: "fsft_holder_recursive",
    dir: path.join(ROOT, "proofs/recursive/fsft_holder"),
    vkEnvVar: "FUND_TOKEN_PRIVATE_HOLDER_VK_HASH",
    publicInputs: [
      "[0] owner_to_field",
      "[1] holder_signal (must be 1)",
    ],
    requiredArgs: ["address"],
    buildInputs(args) {
      return {
        owner: toFieldDecimal(args.address, "address"),
        signal: toFieldDecimal(args.signal ?? "1", "signal"),
        private_balance_hint: toFieldDecimal(args.privateBalanceHint ?? "1", "privateBalanceHint"),
      };
    },
    requestExample(args, outputPath) {
      return {
        endpoint: "POST /api/governance/eligibility",
        body: {
          action: "attestFsftForVoting",
          address: args.address,
          accountIndex: Number(args.accountIndex ?? 0),
          recursiveProofFromFile: outputPath,
        },
      };
    },
  },
  valuation: {
    packageName: "housing_valuation_recursive",
    dir: path.join(ROOT, "proofs/recursive/housing_valuation"),
    vkEnvVar: "HOUSING_FUND_VALUATION_VK_HASH",
    publicInputs: [
      "[0] caller_to_field",
      "[1] asset_sale_price",
      "[2] minted_fsft",
    ],
    requiredArgs: ["address", "assetSalePrice", "mintedFsft"],
    buildInputs(args) {
      return {
        caller: toFieldDecimal(args.address, "address"),
        asset_sale_price: toFieldDecimal(args.assetSalePrice, "assetSalePrice"),
        minted_fsft: toFieldDecimal(args.mintedFsft, "mintedFsft"),
        valuation_nonce: toFieldDecimal(args.valuationNonce ?? "1", "valuationNonce"),
      };
    },
    requestExample(args, outputPath) {
      return {
        endpoint: "private HousingFund.record_asset_sale_recursive(...) call (contract client)",
        notes: [
          `Use this bundle with caller=${args.address}, assetSalePrice=${args.assetSalePrice}, mintedFsft=${args.mintedFsft}.`,
          `Bundle path: ${outputPath}`,
        ],
      };
    },
  },
  rewards: {
    packageName: "rewards_weights_recursive",
    dir: path.join(ROOT, "proofs/recursive/rewards_weights"),
    vkEnvVar: "PROTOCOL_REWARDS_WEIGHTS_VK_HASH",
    publicInputs: [
      "[0] user_to_field",
      "[1] epoch",
      "[2] deposit_weight",
      "[3] fsft_weight",
      "[4] governance_weight",
    ],
    requiredArgs: ["address", "epoch", "depositWeight", "fsftWeight", "governanceWeight"],
    buildInputs(args) {
      return {
        user: toFieldDecimal(args.address, "address"),
        epoch: toFieldDecimal(args.epoch, "epoch"),
        deposit_weight: toFieldDecimal(args.depositWeight, "depositWeight"),
        fsft_weight: toFieldDecimal(args.fsftWeight, "fsftWeight"),
        governance_weight: toFieldDecimal(args.governanceWeight, "governanceWeight"),
        private_nonce: toFieldDecimal(args.privateNonce ?? "1", "privateNonce"),
      };
    },
    requestExample(args, outputPath) {
      return {
        endpoint: "private ProtocolRewards.set_user_epoch_weights_recursive(...) call (contract client)",
        notes: [
          `Use this bundle with user=${args.address}, epoch=${args.epoch}.`,
          `Bundle path: ${outputPath}`,
        ],
      };
    },
  },
};

function printHelp() {
  console.log(`Usage:
  node scripts/generate-recursive-proof-bundle.mjs <kind> [options]

Kinds:
  fsft-holder   Build bundle for FundToken.attest_private_holder_recursive
  valuation     Build bundle for HousingFund.record_asset_sale_recursive
  rewards       Build bundle for ProtocolRewards.set_user_epoch_weights_recursive

Common options:
  --address <0x...>          Aztec address used as owner/user/caller
  --out <path.json>          Output bundle file path (default: proofs/output/<kind>-<timestamp>.json)

fsft-holder options:
  --signal <field>           Defaults to 1
  --private-balance-hint <field>  Defaults to 1
  --account-index <n>        Only used for request example metadata

valuation options:
  --asset-sale-price <u64>
  --minted-fsft <u64>
  --valuation-nonce <field>  Defaults to 1

rewards options:
  --epoch <u32>
  --deposit-weight <u64>
  --fsft-weight <u64>
  --governance-weight <u64>
  --private-nonce <field>    Defaults to 1
`);
}

function parseArgs(argv) {
  const args = {};
  const rest = [...argv];
  const kind = rest.shift();
  if (!kind || kind === "--help" || kind === "-h") {
    return { help: true };
  }

  while (rest.length > 0) {
    const token = rest.shift();
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected token: ${token}`);
    }
    const key = token
      .slice(2)
      .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const value = rest.shift();
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${token.slice(2)}`);
    }
    args[key] = value;
  }

  return { kind, args };
}

function toFieldDecimal(raw, label) {
  const value = String(raw ?? "").trim();
  if (!value) {
    throw new Error(`Missing ${label}`);
  }

  if (/^0[xX][0-9a-fA-F]+$/.test(value)) {
    return BigInt(value).toString(10);
  }
  if (/^[0-9]+$/.test(value)) {
    return BigInt(value).toString(10);
  }
  throw new Error(`${label} must be decimal digits or 0x-prefixed hex`);
}

function run(cmd, cmdArgs, cwd) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error([
      `Command failed: ${cmd} ${cmdArgs.join(" ")}`,
      stdout ? `stdout:\n${stdout}` : "",
      stderr ? `stderr:\n${stderr}` : "",
    ].filter(Boolean).join("\n"));
  }
  return result.stdout?.trim() ?? "";
}

function readFieldArrayFromBinary(filePath, expectedLength) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.length % 32 !== 0) {
    throw new Error(`Invalid field binary length for ${filePath}: ${bytes.length}`);
  }

  const out = [];
  for (let i = 0; i < bytes.length; i += 32) {
    out.push(`0x${bytes.subarray(i, i + 32).toString("hex")}`);
  }

  if (expectedLength !== undefined && out.length !== expectedLength) {
    throw new Error(`Expected ${expectedLength} fields in ${filePath}, got ${out.length}`);
  }
  return out;
}

function writeProverToml(filePath, values) {
  const lines = Object.entries(values).map(([k, v]) => `${k} = "${v}"`);
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    process.exit(0);
  }

  const { kind, args } = parsed;
  const config = CIRCUITS[kind];
  if (!config) {
    throw new Error(`Unknown kind: ${kind}`);
  }

  for (const required of config.requiredArgs) {
    if (!args[required]) {
      throw new Error(`Missing required option --${required.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
    }
  }

  const outputPath = args.out
    ? path.resolve(ROOT, args.out)
    : path.join(ROOT, "proofs/output", `${kind}-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const proverInputPath = path.join(config.dir, "Prover.toml");
  const targetDir = path.join(config.dir, "target");
  const bundleDir = path.join(targetDir, "recursive_bundle");

  writeProverToml(proverInputPath, config.buildInputs(args));

  run(NARGO_BIN, ["compile", "--silence-warnings"], config.dir);
  run(NARGO_BIN, ["execute", "--prover-name", "Prover"], config.dir);

  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.mkdirSync(bundleDir, { recursive: true });

  const bytecodePath = path.join(targetDir, `${config.packageName}.json`);
  const witnessPath = path.join(targetDir, `${config.packageName}.gz`);

  run(BB_BIN, [
    "write_vk",
    "-b", bytecodePath,
    "-o", bundleDir,
    "-t", "noir-recursive",
  ], config.dir);

  run(BB_BIN, [
    "prove",
    "-b", bytecodePath,
    "-w", witnessPath,
    "-k", path.join(bundleDir, "vk"),
    "-o", bundleDir,
    "-t", "noir-recursive",
    "--output_format", "json",
    "--verify",
  ], config.dir);

  const proofPayload = JSON.parse(fs.readFileSync(path.join(bundleDir, "proof.json"), "utf8"));
  const publicInputsPayload = JSON.parse(fs.readFileSync(path.join(bundleDir, "public_inputs.json"), "utf8"));

  if (!Array.isArray(proofPayload.proof)) {
    throw new Error("proof.json did not include proof[]");
  }
  if (!Array.isArray(publicInputsPayload.public_inputs)) {
    throw new Error("public_inputs.json did not include public_inputs[]");
  }

  if (proofPayload.proof.length !== 500) {
    throw new Error(`Expected proof length 500, got ${proofPayload.proof.length}`);
  }

  const verificationKey = readFieldArrayFromBinary(path.join(bundleDir, "vk"), 115);
  const vkHashHex = `0x${fs.readFileSync(path.join(bundleDir, "vk_hash")).toString("hex")}`;
  const vkHashDecimal = BigInt(vkHashHex).toString(10);

  const nargoVersion = run(NARGO_BIN, ["--version"], ROOT);
  const bbVersion = run(BB_BIN, ["--version"], ROOT);

  const output = {
    kind,
    generatedAt: new Date().toISOString(),
    tooling: {
      nargoVersion,
      bbVersion,
      verifierTarget: "noir-recursive",
    },
    circuit: path.relative(ROOT, config.dir),
    publicInputsSchema: config.publicInputs,
    vkHashHex,
    vkHashDecimal,
    bootstrapConfig: {
      envVar: config.vkEnvVar,
      envValue: vkHashDecimal,
      enableStrictEnvVar: "REQUIRE_RECURSIVE_PROOFS",
      enableStrictValue: "true",
    },
    recursiveProof: {
      verificationKey,
      proof: proofPayload.proof,
      publicInputs: publicInputsPayload.public_inputs,
    },
    requestExample: config.requestExample(args, outputPath),
    notes: [
      "This bundle is for local recursive-verification wiring and demos.",
      "The demo circuits in proofs/recursive/* do not yet bind to on-chain private note state.",
    ],
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n", "utf8");

  console.log(`Bundle written: ${outputPath}`);
  console.log(`${config.vkEnvVar}=${vkHashDecimal}`);
  console.log(`REQUIRE_RECURSIVE_PROOFS=true`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
