# Compile one Stage 2 AX probe with the shared support module. Swift requires
# the file containing top-level executable statements to be named main.swift
# when a module has multiple source files, so each caller supplies a fresh
# scratch directory and this helper makes that build-only copy there.
compile_ax_probe() {
  local source="$1" output="$2" scratch="$3"
  mkdir -p "$scratch"
  cp "$source" "$scratch/main.swift"
  xcrun swiftc \
    -framework AppKit \
    -framework ApplicationServices \
    "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/AXProbeSupport.swift" \
    "$scratch/main.swift" \
    -o "$output"
}
