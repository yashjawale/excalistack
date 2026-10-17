# Security policy

## Reporting a vulnerability

Please report suspected security vulnerabilities privately by emailing **[connect@yashjawale.in](mailto:connect@yashjawale.in)**. Do not disclose the issue in a public GitHub issue or pull request until it has been reviewed and a fix or coordinated disclosure plan is available.

Include, where possible:

- A concise description and potential impact
- Steps to reproduce or a proof of concept
- The affected version, deployment setup, and relevant configuration

Do not include real user data, credentials, or other secrets in your report. You may request an encrypted channel if needed. The maintainer will acknowledge the report and coordinate next steps; response and resolution times are not guaranteed.

## Deployment note

The optional MCP endpoint currently has no authentication. Keep it on a trusted network or protect it with appropriate access controls before exposing it beyond localhost. See the [MCP security notes](docs/mcp.md#security).
