# Releasing

Two artefacts ship per version, and they serve different readers:

- **npm** — `dsh plugin --profile web add @xmwengxing/dsh-client-ui-sidebar-perfmon`.
  Prebuilt, no build approval, version-pinnable, and it gives the market a download
  count.
- **A GitHub Release tarball** — the plugin list entry points at
  `releases/latest/download/dsh-client-ui-sidebar-perfmon.tgz`. This one is not
  optional: it is what makes the entry installable without a build step, and the
  asset name is deliberately version-free so that URL cannot rot.

## The normal path

```sh
# 1. Bump the version and add a `## <version>` section to CHANGELOG.md.
# 2. Land that on master.
git commit -am "0.2.3: ..."
git push origin master

# 3. Tag it. The tag is the release trigger.
git tag v0.2.3
git push origin v0.2.3
```

The [`publish`](.github/workflows/publish.yml) workflow then runs the suite,
publishes to npm with a provenance attestation, and creates the Release with the
tarball attached, using that version's CHANGELOG section as the notes. It refuses
to publish when the tag and `package.json` disagree.

`workflow_dispatch` runs the same workflow by hand and defaults to a pack-only dry
run.

## One-time setup: trusted publishing

The workflow publishes **without any token**. The runner exchanges a short-lived
GitHub OIDC token for the right to publish this one package, and npm records a
provenance attestation with it. Configure it once, on npmjs.com:

1. Package → **Settings** → **Trusted Publisher** → **GitHub Actions**.
2. Repository: `xmwengxing/dsh-client-ui-sidebar-perfmon`
3. Workflow filename: `publish.yml`
4. Environment: leave blank.

Until that exists, the workflow's publish step fails and a local `npm publish` is
the only route.

## Why not just publish locally

An account with 2FA enabled cannot be published for by a machine. npm answers the
`PUT` with a challenge, opens an authorisation URL, and waits for a human to
approve it in a browser — and outside an interactive terminal npm masks that URL
and gives up, so an agent cannot drive it at all.

The alternatives are worse than the workflow:

- **Handing a machine the TOTP seed** makes a permanent second factor into a file.
  It is worth more than every release it would save.
- **A bypass-2FA token** works today, but npm is restricting that model (account
  changes since Aug 2026, direct publishing from Jan 2027).

So: releases are triggered by a tag, and no credential lives anywhere.
