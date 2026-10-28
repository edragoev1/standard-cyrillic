#!/bin/bash
# Builds the two packages from this folder, into ~/Projects:
#   standard-cyrillic-<version>-chrome.zip    Chrome Web Store, Edge Add-ons
#   standard-cyrillic-<version>-firefox.zip   Firefox Add-ons (desktop, Android)
# The Firefox manifest adds its add-on ID and its data-collection declaration,
# and leaves out use_dynamic_url, which only Chrome has.
set -euo pipefail
cd "$(dirname "$0")"
version=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
out=$HOME/Projects
files="content.js popup.html popup.js icons fonts README.md LICENSE"
rm -f "$out/standard-cyrillic-$version-chrome.zip" "$out/standard-cyrillic-$version-firefox.zip"
zip -qr -X "$out/standard-cyrillic-$version-chrome.zip" manifest.json $files
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -r $files "$tmp/"
python3 - "$tmp/manifest.json" <<'PY'
import json, sys
m = json.load(open("manifest.json"))
for r in m.get("web_accessible_resources", []):
    r.pop("use_dynamic_url", None)
m["browser_specific_settings"] = {
    "gecko": {
        "id": "{633f514a-310b-4700-a143-3a1c5b055de7}",
        "strict_min_version": "128.0",
        "data_collection_permissions": {"required": ["none"]},
    },
    "gecko_android": {"strict_min_version": "128.0"},
}
json.dump(m, open(sys.argv[1], "w"), indent=2, ensure_ascii=False)
PY
(cd "$tmp" && zip -qr -X "$out/standard-cyrillic-$version-firefox.zip" manifest.json $files)
echo "$out/standard-cyrillic-$version-chrome.zip"
echo "$out/standard-cyrillic-$version-firefox.zip"
