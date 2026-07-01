{ lib, buildNpmPackage, nodejs_22 }:

buildNpmPackage rec {
  pname = "neotube";
  version = "0.1.0";

  src = ./.;
  nodejs = nodejs_22;

  # Run `nix build` once and replace with the hash printed in the error.
  npmDepsHash = lib.fakeHash;

  # Vite outputs to dist/
  installPhase = ''
    runHook preInstall
    cp -r dist $out
    runHook postInstall
  '';

  meta = with lib; {
    description = "A free, open source, privacy-respecting YouTube client";
    license = licenses.gpl3Only;
    platforms = platforms.all;
    mainProgram = "neotube";
  };
}
