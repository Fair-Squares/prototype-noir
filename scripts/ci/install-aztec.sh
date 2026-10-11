#!/usr/bin/env bash
# Fair Squares -- install the Aztec host toolchain for contract compile/test.
#
# Why this exists instead of `bash -i <(curl -sL https://install.aztec.network/<v>)`:
# the per-version installer is frozen on S3 and bundles foundry through the
# *moving* foundryup bootstrap. Newer foundryup releases turned `bin/forge` etc.
# into symlinks, so the frozen installer's `mv` leaves dangling links and the
# whole install aborts with
#   "expected bundled binary 'forge' missing from .../internal-bin"
# (that is exactly what broke CI). Contract compile + TXE tests need nargo, bb
# and the @aztec npm packages only -- never forge/anvil/cast -- so we run the
# upstream version installer with the foundry step made best-effort and the
# native-symlink step tolerant of the missing foundry tools.
#
# Usage:
#   scripts/ci/install-aztec.sh [VERSION]      # default: contents of .aztec-version
#   AZTEC_HOME=/custom/dir scripts/ci/install-aztec.sh 6.0.0-rc.3
#
# Afterwards put "$AZTEC_HOME/current/bin" on PATH (CI appends it to GITHUB_PATH).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
VERSION="${1:-${AZTEC_VERSION:-$(tr -d '[:space:]' < "$ROOT_DIR/.aztec-version")}}"
AZTEC_HOME="${AZTEC_HOME:-$HOME/.aztec}"
INSTALL_URI="${INSTALL_URI:-https://install.aztec-labs.com}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

[ -n "$VERSION" ] || { echo "install-aztec: no version given and .aztec-version is empty" >&2; exit 1; }

echo "[install-aztec] installing Aztec $VERSION into $AZTEC_HOME"
curl -fsSL "$INSTALL_URI/$VERSION/install" -o "$WORK/install.sh"

# Patch 1: foundry becomes best-effort (it is not needed for compile/test).
# Patch 2: don't abort when the foundry binaries are absent from internal-bin.
# Both patches assert they matched so a changed upstream installer fails loudly
# instead of silently running unpatched.
patch_installer() {
  local file=$1
  grep -q 'dump_fail retry install_foundry' "$file" \
    || { echo "install-aztec: upstream installer changed (foundry step not found); update this script" >&2; exit 1; }
  grep -q 'for tool in forge cast anvil chisel nargo noir-profiler; do' "$file" \
    || { echo "install-aztec: upstream installer changed (native symlink loop not found); update this script" >&2; exit 1; }
  sed -i \
    -e 's|dump_fail retry install_foundry|if [ "${AZTEC_INSTALL_SKIP_FOUNDRY:-0}" = "1" ]; then echo -n "(skipped) "; else (dump_fail retry install_foundry) \|\| echo -n "(unavailable, continuing without forge/anvil) "; fi|' \
    -e 's|for tool in forge cast anvil chisel nargo noir-profiler; do|for tool in forge cast anvil chisel nargo noir-profiler; do\n    if [ ! -e "$version_internal_bin_path/$tool" ] \&\& case "$tool" in forge\|cast\|anvil\|chisel) true;; *) false;; esac; then echo "  (no bundled $tool; aztec-$tool not linked)" >\&2; continue; fi|' \
    "$file"
}
patch_installer "$WORK/install.sh"

mkdir -p "$AZTEC_HOME"
# CI=1 makes the installer's internal `timeout` wrapper a no-op (it is not
# available on every runner) -- the upstream script keys that off CI=1/true.
VERSION="$VERSION" CI="${CI:-1}" bash "$WORK/install.sh"
ln -sfn "$AZTEC_HOME/versions/$VERSION" "$AZTEC_HOME/current"

export PATH="$AZTEC_HOME/current/bin:$PATH"
echo "[install-aztec] aztec $(aztec --version) / $(aztec-nargo --version | head -1)"
