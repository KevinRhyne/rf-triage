#!/bin/sh
# Publish triage/ to the live site (GitHub Pages repo KevinRhyne/rf-triage).
# Run from anywhere inside the rafsite repo after committing your changes.
set -e
root=$(git rev-parse --show-toplevel)
cd "$root"
split=$(git subtree split --prefix=triage)
tmp=$(mktemp -d)
git clone -q git@github.com:KevinRhyne/rf-triage.git "$tmp"
cd "$tmp"
git fetch -q "$root" "$split"
git merge -q --no-edit FETCH_HEAD -m "Deploy triage from rafsite"
git push -q origin main
rm -rf "$tmp"
echo "Deployed. Live in a minute at https://triage.rhyneandfriends.com"
