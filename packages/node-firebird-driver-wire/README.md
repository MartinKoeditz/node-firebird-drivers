[![CI](https://github.com/asfernandes/node-firebird-drivers/workflows/CI/badge.svg)](https://github.com/asfernandes/node-firebird-drivers/actions?query=workflow%3ACI)
[![npm version](https://badge.fury.io/js/node-firebird-driver-wire.svg)](https://www.npmjs.com/package/node-firebird-driver-wire)

# Firebird wire driver for Node.js / TypeScript

`node-firebird-driver-wire` is the beginning of a pure Node.js Firebird driver that talks to the Firebird wire protocol directly, without the native `fbclient` library.

The current implementation is intentionally low-level and internal-only. It provides the protocol foundation for Firebird 3+ authentication and attachment handling.
