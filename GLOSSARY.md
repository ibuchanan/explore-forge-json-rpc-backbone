# Glossary

## Trigger

An occurrence that starts application work. A trigger does not by itself define
the operation to perform or grant authority to perform it.

## Command

A named application operation with explicit input, successful output, and
possible failures. In this project, the term includes read-only operations.

## Command contract

The description of a command's name, input, output, and expected failures.

## Command call

A particular request to execute a named command with supplied parameters.

## Command handler

The application behavior that performs one command for a permitted caller.

## Command executor

The interface that resolves a command call, enforces its execution rules,
and produces an application outcome.

## Outcome

The application meaning of completed work: either successful output or a failure.
An outcome is distinct from how a caller receives or acknowledges it.

## Adapter

The translation between a caller's invocation/completion rules and a command's
input/outcome. Different callers can share commands without sharing authority.

## Binding

The deliberate selection of a command for a particular kind of invocation.

## Execution profile

The operations and outcomes permitted for a particular caller, including expected
denials and positive paths that the caller cannot exercise.

## Addressability

The ability to name and submit a command through an interface. Addressability
does not imply permission to execute the command successfully.

## Write uncertainty

A state where the caller cannot establish whether an attempted change persisted.
It is not evidence of rollback or permission to repeat the operation.
