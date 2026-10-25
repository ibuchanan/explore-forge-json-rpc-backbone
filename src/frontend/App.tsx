import {
  Button,
  CodeBlock,
  ErrorMessage,
  Form,
  Heading,
  HelperMessage,
  Label,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  TextArea,
  Textfield,
  useForm,
} from "@forge/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Commands } from "../rpc-types";
import { failureMessage, rpc, RpcFailure } from "./client";

const prefixHelp =
  "Surrounding whitespace is trimmed. Enter 1–64 Unicode code points after trimming. This is not a secret.";
const textHelp =
  "Empty text is allowed; maximum 2,000 Unicode code points. Uses the saved prefix, not unsaved edits.";

type Config = Commands["config.get"]["result"];
type Operation = "load" | "save" | "preview";

function PrefixForm({
  prefix,
  disabled,
  saving,
  onSave,
}: {
  prefix: string;
  disabled: boolean;
  saving: boolean;
  onSave: (prefix: string) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    getFieldId,
    formState: { errors },
  } = useForm({ defaultValues: { prefix } });
  return (
    <Form onSubmit={handleSubmit(({ prefix }) => onSave(prefix))}>
      <Stack space="space.100">
        <Label labelFor={getFieldId("prefix")}>Prefix</Label>
        <Textfield
          {...register("prefix", {
            validate: (value) =>
              (value.trim().length > 0 && [...value.trim()].length <= 64) ||
              prefixHelp,
          })}
          isDisabled={disabled}
        />
        <HelperMessage>{prefixHelp}</HelperMessage>
        {errors.prefix && <ErrorMessage>{prefixHelp}</ErrorMessage>}
        <Button type="submit" appearance="primary" isDisabled={disabled}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </Stack>
    </Form>
  );
}

function PreviewForm({
  disabled,
  running,
  onRun,
  onEdit,
}: {
  disabled: boolean;
  running: boolean;
  onRun: (text: string) => Promise<void>;
  onEdit: () => void;
}) {
  const {
    register,
    handleSubmit,
    getFieldId,
    formState: { errors },
  } = useForm({ defaultValues: { text: "" } });
  const field = register("text", {
    validate: (value) => [...value].length <= 2000 || textHelp,
  });
  return (
    <Form onSubmit={handleSubmit(({ text }) => onRun(text))}>
      <Stack space="space.100">
        <Label labelFor={getFieldId("text")}>Preview text</Label>
        <TextArea
          {...field}
          isDisabled={disabled}
          onChange={(event) => {
            field.onChange(event);
            onEdit();
          }}
        />
        <HelperMessage>{textHelp}</HelperMessage>
        {errors.text && <ErrorMessage>{textHelp}</ErrorMessage>}
        <Button type="submit" isDisabled={disabled}>
          {running ? "Running preview…" : "Run preview"}
        </Button>
      </Stack>
    </Form>
  );
}

export function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [pending, setPending] = useState<Operation | null>("load");
  const [formVersion, setFormVersion] = useState(0);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);

  const perform = useCallback(
    async (operation: Operation, action: () => Promise<void>) => {
      if (busy.current) return;
      busy.current = true;
      setPending(operation);
      setError("");
      setSaved(false);
      try {
        await action();
      } catch (error) {
        setError(failureMessage(error));
        if (
          error instanceof RpcFailure &&
          (error.code === -32001 || error.code === -32002)
        ) {
          setConfig(null);
          setOutput(null);
        }
      } finally {
        busy.current = false;
        setPending(null);
      }
    },
    [],
  );

  const load = useCallback(
    () =>
      perform("load", async () => {
        const result = await rpc("config.get", {});
        setConfig(result);
        setFormVersion((version) => version + 1);
        setOutput(null);
      }),
    [perform],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const save = (prefix: string) =>
    perform("save", async () => {
      await rpc("config.set", { prefix });
      setOutput(null);
      setConfig(null);
      try {
        const result = await rpc("config.get", {});
        setConfig(result);
        setFormVersion((version) => version + 1);
        setSaved(true);
      } catch (error) {
        setError(
          `Prefix was saved, but read-back verification failed. ${failureMessage(error)}`,
        );
      }
    });

  const preview = (text: string) =>
    perform("preview", async () => {
      setOutput(null);
      const result = await rpc("integration.preview", { text });
      setOutput(result.output);
    });

  const disabled = pending !== null || config === null;
  return (
    <Stack space="space.200">
      <Heading as="h1" size="large">
        JSON-RPC configuration
      </Heading>
      <Text>
        Preview only combines the saved prefix and text; it does not run a Jira
        or third-party integration.
      </Text>
      {pending && (
        <Spinner
          label={
            pending === "load"
              ? "Loading configuration"
              : pending === "save"
                ? "Saving prefix and verifying"
                : "Running preview"
          }
        />
      )}
      {error && (
        <SectionMessage appearance="error" title="Action needed">
          <Text>{error}</Text>
        </SectionMessage>
      )}
      {!config && !pending && (
        <Button
          onClick={() => {
            void load();
          }}
        >
          Retry
        </Button>
      )}
      {saved && (
        <SectionMessage appearance="success">
          <Text>Prefix saved</Text>
        </SectionMessage>
      )}
      {config && (
        <Text>{config.configured ? "Configured" : "Not configured"}</Text>
      )}
      {config && !config.configured && (
        <Text>Save a prefix to enable preview.</Text>
      )}
      <PrefixForm
        key={formVersion}
        prefix={config?.prefix ?? ""}
        disabled={disabled}
        saving={pending === "save"}
        onSave={save}
      />
      <PreviewForm
        disabled={disabled || !config?.configured}
        running={pending === "preview"}
        onRun={preview}
        onEdit={() => setOutput(null)}
      />
      {output !== null && (
        <Stack space="space.100">
          <Heading as="h2" size="small">
            Preview output
          </Heading>
          <CodeBlock
            text={output}
            language="text"
            showLineNumbers={false}
            shouldWrapLongLines={false}
          />
        </Stack>
      )}
    </Stack>
  );
}
