# **Architectural Exploration: Building a Command-Oriented JSON-RPC Engine for Atlassian Forge**

## **Executive Summary**

Building complex enterprise extensions on the Atlassian Forge platform often presents distinct architectural challenges around performance, maintainability, and end-to-end testing velocity. Traditional Forge implementations tie business logic directly to custom UI bridge handlers (@forge/resolver), making automated testing slow, coupling logic tightly to browser environments, and preventing non-UI integrations.  
This document presents an architectural blueprint for a **Command-Oriented Engine** backed by a parallel **JSON-RPC 2.0 API**. By establishing a unified, command-driven core that serves both local Custom UI requests and external HTTP Webtriggers, we decouple execution logic from transport layers. This approach enables rapid local integration testing without browser overhead, empowers auto-generated CLI interfaces, and maintains strict security isolation across diverse execution paths.

## ---

**Core Architectural Design**

The overarching pattern separates execution transports from business execution by introducing a single **Command Dispatcher Core**. Regardless of whether an event originates from a user interaction in a React frontend or an HTTP request via a CLI tool, the execution pipeline remains identical.

### **Architectural Topography**

`┌──────────────────────────────┐        ┌──────────────────────────────┐`  
`│       Forge Custom UI        │        │      CLI / External API      │`  
`│   (React / @forge/bridge)    │        │  (HTTP POST / Shell Commands)│`  
`└──────────────┬───────────────┘        └──────────────┬───────────────┘`  
               `│                                       │`  
               `│ invoke('rpc', payload)                │ HTTP JSON-RPC Request`  
               `▼                                       ▼`  
`┌──────────────────────────────┐        ┌──────────────────────────────┐`  
`│     Forge UI Resolver        │        │    Forge Webtrigger Handler  │`  
`│   (Extracts User Context)    │        │    (Validates Auth Header)   │`  
`└──────────────┬───────────────┘        └──────────────┬───────────────┘`  
               `│                                       │`  
               `└──────────────────┬────────────────────┘`  
                                  `│ Normalizes Context & Request`  
                                  `▼`  
`┌──────────────────────────────────────────────────────────────────────┐`  
`│                       Command Dispatcher Core                        │`  
`│  - Validates JSON-RPC 2.0 Compliance                                 │`  
`│  - Routes method to registered handler                               │`  
`│  - Injects standardized SecurityContext                              │`  
`└─────────────────────────────────┬────────────────────────────────────┘`  
                                  `│`  
                                  `▼`  
`┌──────────────────────────────────────────────────────────────────────┐`  
`│                        Core Domain Services                          │`  
`│        (Atlassian Product APIs, Business Logic, Storage)             │`  
`└──────────────────────────────────────────────────────────────────────┘`

## ---

**Unified Command Protocol (JSON-RPC 2.0)**

All interactions conform strictly to the **JSON-RPC 2.0 Specification**. This guarantees predictable payload shapes across both client-side bridge calls and external webtriggers.

### **Mapping Domain Concepts to JSON-RPC**

> * **Command Identifier:** Represented as the method string (e.g., issue.addComment, project.getDetails).  
> * **Command Input:** Serialized object mapped to params.  
> * **Command Execution ID:** Unique identifier in id for tracking and response matching.  
> * **Fire-and-Forget (Notifications):** Omitting id signals an asynchronous notification that requires no return payload.

### **Schema Definition Standards**

Command specifications are defined using runtime schema validators such as **Zod** or **TypeBox**. This enables static TypeScript inference for frontends and runtime boundary validation for external Webtriggers.

| Field | Type | Description   |
| :---- | :---- | :---- |
| **jsonrpc** | string | Must be exactly "2.0". |
| **method** | string | The command identifier matching the registry handler. |
| **params** | object | array | Input arguments matching the command schema. |
| **id** | string | number | null | Correlation ID for response matching. Omitted for notifications. |

## ---

**Decoupled Security & Context Adapter Pattern**

A primary design requirement is keeping authorization logic out of individual command implementations. Commands must not be aware of HTTP headers, Bearer tokens, or Forge bridge contexts.

### **The Context Adapter Boundary**

To achieve this, entry-point adapters normalize platform-specific authentication into a unified SecurityContext before calling the core dispatcher.

### **1\. Standard Security Context Definition**

`export interface SecurityContext {`  
  `userId: string;                   // Atlassian Account ID or Service Account ID`  
  `isAuthenticated: boolean;`  
  `permissions: string[];            // Domain-level permissions or scopes`  
  `executionSource: 'ui' | 'api';    // Metadata for auditing and metrics`  
`}`

### **2\. Dual Transport Adapters**

#### **A. Custom UI Adapter (Forge Bridge)**

Custom UI calls implicitly trust the authenticated Atlassian session supplied by @forge/bridge. The resolver extracts the accountId directly from the framework request context:  
`// Adapts @forge/resolver request to SecurityContext`  
`resolver.define('rpc', async (req) => {`  
  `const userAccountId = req.context.accountId;`

  `const securityContext: SecurityContext = {`  
    `userId: userAccountId || 'anonymous',`  
    `isAuthenticated: !!userAccountId,`  
    `permissions: ['*'], // Inherits logged-in Jira/Confluence permissions`  
    `executionSource: 'ui',`  
  `};`

  `return await processJsonRpcPayload(req.payload, securityContext);`  
`});`

#### **B. Webtrigger Adapter (HTTP Endpoint)**

Webtriggers inspect incoming HTTP headers, validate Bearer tokens or HMAC signatures, and construct an equivalent SecurityContext:  
`// Adapts HTTP Request to SecurityContext`  
`export async function runWebtrigger(request: { body: string; headers: Record<string, string[]> }) {`  
  `const securityContext = await authenticateWebtriggerHeaders(request.headers);`

  `if (!securityContext.isAuthenticated) {`  
    `return {`  
      `statusCode: 401,`  
      `headers: { 'Content-Type': ['application/json'] },`  
      `body: JSON.stringify({`  
        `jsonrpc: '2.0',`  
        `id: null,`  
        `error: { code: -32001, message: 'Unauthorized: Invalid API key or token' },`  
      `}),`  
    `};`  
  `}`

  `const payload = JSON.parse(request.body);`  
  `const rpcResponse = await processJsonRpcPayload(payload, securityContext);`

  `return {`  
    `statusCode: 200,`  
    `headers: { 'Content-Type': ['application/json'] },`  
    `body: JSON.stringify(rpcResponse),`  
  `};`  
`}`

## ---

**Generated CLI Tooling**

Because the command registry defines descriptions, identifiers, and parameter schemas in code, an administrative CLI can be dynamically generated at build or execution time using tools like commander or yargs.

### **CLI Generation Pipeline**

> 1. **Read Registry:** Iterate through registered commands and parameters.  
> 2. **Construct Commands:** Map dot-notation methods (e.g. issue.addComment) to nested CLI subcommands (issue addComment).  
> 3. **Inject Options:** Automatically derive flags (e.g. \--issueId, \--body) from input schemas.  
> 4. **Dispatch Request:** Build the standard JSON-RPC payload and send an HTTP POST to the deployed Webtrigger URL.

This ensures **zero drift** between backend capabilities, UI commands, and command-line interfaces.

## ---

**Testing Strategy & Velocity Gains**

The primary benefit of this architecture is a massive increase in integration testing speed and reliability.

### **Comparison of Testing Approaches**

| Testing Dimension | Traditional Forge UI Testing | Command-Oriented JSON-RPC Testing   |
| :---- | :---- | :---- |
| **Execution Velocity** | Slow (Minutes per test suite) | Extremely Fast (Milliseconds per suite) |
| **Environment Requirements** | Requires live Jira site \+ browser runtime | Runs in pure local Node.js process (Vitest/Jest) |
| **Flakiness** | High (DOM changes, loading states, iFrame latency) | Near Zero (Deterministic JSON inputs and outputs) |
| **Deployment Verification** | Requires manual UI clicks or complex Playwright scripts | Automated HTTP requests against Webtrigger endpoint |

### **Local Integration Test Pattern**

Because the core dispatcher accepts standard JavaScript objects and returns plain JSON-RPC responses, unit and integration tests execute directly in Node without starting HTTP servers or browser engines:  
`describe('JSON-RPC Command Core Integration', () => {`  
  `it('executes issue.addComment cleanly', async () => {`  
    `const request = {`  
      `jsonrpc: '2.0' as const,`  
      `id: 101,`  
      `method: 'issue.addComment',`  
      `params: { issueId: 'KAN-123', body: 'Automated test comment' },`  
    `};`

    `const mockContext: SecurityContext = {`  
      `userId: 'test-user-acc-id',`  
      `isAuthenticated: true,`  
      `permissions: ['*'],`  
      `executionSource: 'api',`  
    `};`

    `const response = await processJsonRpcPayload(request, mockContext);`

    `expect(response.error).toBeUndefined();`  
    `expect(response.result).toHaveProperty('commentId');`  
  `});`  
`});`

## ---

**Summary & Next Steps**

By shifting from platform-coupled handlers to a **Command-Oriented JSON-RPC Architecture**, Forge apps gain enterprise-grade testability, flexible integrations via CLI or HTTP, and a strict isolation between transport security and core business logic.