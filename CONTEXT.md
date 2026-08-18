# DeepSeek Harness Article Context

Canonical vocabulary for the DeepSeek Harness architecture series. These terms describe the runtime model used by the articles and keep adjacent entries consistent.

## Runtime History

**Input**:
A message or runtime signal that enters the Agent inbox. A Follow-up Input can wake an idle Agent, while other Input may wait for admission to a later Step.

**Turn**:
One continuous period of Agent activity, beginning when the Agent is awakened and ending when no further work is currently owed. A Turn contains zero or more Steps.
_Avoid_: request

**Step**:
One model request together with the Tool executions requested by that model output.
_Avoid_: Turn, action

**Session**:
The stable identity and complete interaction history of one Agent across multiple Turns.
_Avoid_: Chat, conversation transcript

**Session Event Log**:
The append-only ordered record that is the source of truth for a Session. Chat messages are one projection of the log, not the whole record.
_Avoid_: Chat log, message history

**Agent Loop**:
The runtime driver that turns Inputs into ordered Turns and Steps while relying on other Services for model access, tools, prompt assembly, and Session history.
_Avoid_: Harness, Session

**Durable Session Event**:
A recorded fact that remains part of the Session Event Log and can be reconstructed after the process is restarted.
_Avoid_: Runtime callback, trace span

**Live Runtime Event**:
A notification or interception point used while the current execution is in flight; it is not itself part of the Session Event Log.
_Avoid_: Session event, chat message

## Continuation

**Persistence**:
The capability that stores a Session Event Log beyond the lifetime of the current process.
_Avoid_: Session

**Resume**:
Continuation of the same Session identity from its persisted history.
_Avoid_: Fork, replay

**Crash Recovery**:
Reconstruction of a valid Session history after an interrupted write or unfinished Turn while preserving the valid recorded prefix.
_Avoid_: Resume

**Fork**:
Creation of a new Session from a valid completed boundary in another Session, with explicit parent lineage and an independently evolving future.
_Avoid_: Resume, rewind, edit history
