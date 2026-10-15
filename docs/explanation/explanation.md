# Why commands sit between transports and behavior

This repository explores a command-oriented architecture for a Forge app. In
this design, a command is a named request for an operation with explicit input
and a result. It is not a shell command or necessarily a class implementing the
Gang of Four Command pattern. The proposed `text.analyze` command, for example,
would accept text and return counts. A dispatcher would interpret a request,
validate its input, select the command, and return a serializable result or
error. That dispatcher is the shared seam; it is not another public endpoint.

Today the repository does **not** implement that seam. The manifest wires two
web triggers to hello-world handlers in `src/index.ts`. There is no UI,
resolver, command dispatcher, or JSON-RPC API yet. The
[proof-of-concept spec](../../specs/spec.md) describes the next experiment,
not the current behavior.

## Why put a command in the middle?

Forge entry points have different shapes. A Custom UI would call a backend
resolver through Forge Bridge, while an external client would call a web
trigger over HTTP. If each adapter contains its own operation logic, the same
behavior can drift across entry points and can only be tested through those
platform surfaces. The proposed command seam lets each adapter translate its
input into the same request; the dispatcher then applies the shared validation,
method lookup, source policy, and error mapping. A local test could exercise
that seam without a browser or deployed HTTP endpoint.

The separation is about *behavior*, not identity. A resolver can derive an
Atlassian user from server-side Forge context. A web trigger is a public URL
with no Atlassian user attached; an authenticated external client would be a
different actor. The adapters must establish identity from trusted inputs and
reject unauthorized requests before dispatch. A common request shape must not
turn an external token into a Jira user's permissions. If a later command uses
product APIs, its authorization must be designed for each caller and operation;
`asApp()` alone does not check an end user's permissions.

## Why a JSON-RPC-shaped envelope?

A method name, object parameters, and a request ID give the proposed command
seam a compact, transport-neutral vocabulary. The same result or error shape
can be observed through a resolver or a web trigger, making comparison
possible. JSON-RPC is a wire-format choice here, not the command pattern
itself. The POC deliberately proposes only single requests with required IDs;
it does not promise full JSON-RPC 2.0 support for batches, notifications, or
positional parameters. The earlier
[architectural exploration](../../specs/Architectural%20Exploration_%20Command-Oriented%20JSON-RPC%20Engine%20for%20Atlassian%20Forge.md)
is a broader hypothesis, not an implemented contract or a safe authorization
template.

## What the separation does not buy

Local tests can show that one command behaves consistently for chosen inputs;
they cannot prove that manifest wiring, Forge Bridge, HTTP authentication, or
an installed UI works. Those still need deployed checks. Two adapters also
cost more to secure and maintain than one. The POC uses one deterministic,
read-only command to assess whether the shared seam earns that cost before
adding product API operations, a registry generator, or a CLI. If it does not,
a resolver-only command module is simpler.
