import { router } from "@forge/bridge";
import {
  Button,
  ButtonGroup,
  CodeBlock,
  ErrorMessage,
  Form,
  Heading,
  HelperMessage,
  Inline,
  Label,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  TextArea,
  Textfield,
  useForm,
} from "@forge/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { rpcErrors } from "../rpc-errors";
import type { Commands } from "../rpc-types";
import { failureMessage, rpc, RpcFailure } from "./client";

const prefixHelp =
  "Enter 1–64 Unicode code points, including any surrounding whitespace, which is trimmed before saving. This is not a secret.";
const textHelp =
  "Empty text is allowed; maximum 2,000 Unicode code points. Uses the saved prefix, not unsaved edits.";

type Config = Commands["config.get"]["result"];
type Operation = "load" | "save" | "reset" | "preview" | "navigate";

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
        <Heading as="h2" size="small">
          1. Save a prefix
        </Heading>
        <Text>
          A prefix is text added at the start of the preview output. For
          example, save demo: to place demo: before each sample. This setting is
          shared by this installation’s admin screens and authenticated HTTP
          commands; it is not an API token or a Jira project setting.
        </Text>
        <Label labelFor={getFieldId("prefix")}>Prefix</Label>
        <Textfield
          {...register("prefix", {
            validate: (value) =>
              (value.trim().length > 0 && [...value].length <= 64) ||
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
        <Heading as="h2" size="small">
          2. Try the saved prefix
        </Heading>
        <Text>
          Preview text is a sample to place after your saved prefix. Enter a
          space followed by hello, then choose Run preview. With demo: saved,
          the output is demo: hello. No separator is added automatically, so
          include any space or new line in your sample. Unsaved prefix edits are
          not used.
        </Text>
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

const pages = {
  status: { label: "Status", moduleKey: "config-admin" },
  configure: { label: "Configure", moduleKey: "config-configure" },
  "get-started": { label: "Get started", moduleKey: "config-get-started" },
};

type Page = keyof typeof pages;

export function App({ page = "configure" }: { page?: Page }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [pending, setPending] = useState<Operation | null>("load");
  const [formVersion, setFormVersion] = useState(0);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const busy = useRef(false);

  const perform = useCallback(
    async (operation: Operation, action: () => Promise<void>) => {
      if (busy.current) return;
      busy.current = true;
      setPending(operation);
      setError("");
      setSaved(false);
      setResetComplete(false);
      setConfirmReset(false);
      try {
        await action();
      } catch (error) {
        setError(failureMessage(error));
        if (
          error instanceof RpcFailure &&
          (error.code === rpcErrors.forbidden.code ||
            error.code === rpcErrors["not-configured"].code)
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
        setConfig(null);
        setOutput(null);
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

  const reset = () => {
    if (!confirmReset) return;
    return perform("reset", async () => {
      setConfig(null);
      setOutput(null);
      let accepted = false;
      try {
        await rpc("config.reset", { confirm: true });
        accepted = true;
        const result = await rpc("config.get", {});
        if (result.configured || result.prefix !== null)
          throw new Error("Reset read-back did not match");
        setConfig(result);
        setFormVersion((version) => version + 1);
        setResetComplete(true);
        setPreviewVersion((version) => version + 1);
      } catch (error) {
        setError(
          `${accepted ? "Configuration was reset, but read-back verification failed." : "Reset could not be confirmed; configuration may have changed."} Retry the read before attempting another reset. ${failureMessage(error)}`,
        );
      }
    });
  };

  const preview = (text: string) =>
    perform("preview", async () => {
      setOutput(null);
      const result = await rpc("integration.preview", { text });
      setOutput(result.output);
    });

  const navigate = (target: Page) =>
    perform("navigate", async () => {
      try {
        await router.navigate({
          target: "module",
          moduleKey: pages[target].moduleKey,
        });
      } catch {
        setError(
          "The page could not be opened. Retry the navigation or open the app from Manage apps in Jira settings.",
        );
      }
    });

  const disabled = pending !== null || config === null || confirmReset;
  return (
    <Stack space="space.200">
      {page === "status" && (
        <Text>
          Check whether this installation has a saved prefix for the demo.
          Configured means a prefix is stored and preview is available; it does
          not mean an external integration is connected. Refresh rereads the
          saved configuration; it does not test the HTTP endpoint or its
          credential.
        </Text>
      )}
      {page === "configure" && (
        <Text>
          Set up and try the text-combining demo. First save a prefix, then
          enter sample text and run a preview to see them joined together.
          Saving changes this installation’s demo setting; running a preview
          does not save your sample text, change Jira issues, or contact a
          third-party service.
        </Text>
      )}
      {page === "get-started" && (
        <Stack space="space.100">
          <Text>
            This proof of concept explores how a Forge admin UI and an
            authenticated HTTP endpoint can use the same JSON-RPC commands and
            saved configuration. It is an architecture demo, not an active
            integration with Jira or a third-party service.
          </Text>
          <Text>
            The demo has one setting: a prefix, a short piece of text placed
            before each sample you preview. Save it once for this installation,
            then try different sample text without changing the setting. You
            need Jira administrator access to use these screens.
          </Text>
        </Stack>
      )}
      {pending && (
        <Spinner
          label={
            pending === "load"
              ? "Loading configuration"
              : pending === "save"
                ? "Saving prefix and verifying"
                : pending === "reset"
                  ? "Resetting configuration and verifying"
                  : pending === "preview"
                    ? "Running preview"
                    : "Opening page"
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
          <Text>
            The setting was stored and read back successfully. Run a preview
            below to try the saved value; no preview has been run by saving.
          </Text>
        </SectionMessage>
      )}
      {resetComplete && (
        <SectionMessage appearance="success" title="Configuration reset">
          <Text>
            The saved demo prefix was removed and the unconfigured state was
            verified. Preview is disabled until you save a new prefix. The app
            installation has not changed.
          </Text>
        </SectionMessage>
      )}
      {config && pending !== "save" && pending !== "reset" && !error && (
        <Stack space="space.100">
          <Inline space="space.150" alignBlock="center" shouldWrap>
            <Lozenge
              appearance={config.configured ? "success" : "removed"}
              isBold
            >
              {config.configured ? "Configured" : "Not configured"}
            </Lozenge>
            <Text weight="medium">Configuration</Text>
          </Inline>
          {!saved && (
            <SectionMessage
              appearance={config.configured ? "success" : "warning"}
              title={
                config.configured ? "Configuration verified" : "Setup needed"
              }
            >
              <Text>
                {config.configured
                  ? "A saved demo prefix was read successfully. You can run a preview on Configure. This verifies saved configuration only, not preview output or HTTP connectivity."
                  : "No demo prefix is saved yet. Open Configure and save the text you want added before each sample. Save a prefix to enable preview."}
              </Text>
            </SectionMessage>
          )}
        </Stack>
      )}
      {page === "status" && config?.configured && (
        <Stack space="space.100">
          <Heading as="h2" size="small">
            Saved prefix
          </Heading>
          <CodeBlock
            text={config.prefix ?? ""}
            language="text"
            showLineNumbers={false}
            shouldWrapLongLines
          />
        </Stack>
      )}
      {page === "get-started" && config && !error && (
        <Stack space="space.100">
          <Heading as="h2" size="small">
            Setup checklist
          </Heading>
          <Inline space="space.150" alignBlock="center" shouldWrap>
            <Lozenge appearance={config.configured ? "success" : "removed"}>
              {config.configured ? "Complete" : "Action needed"}
            </Lozenge>
            <Text weight="medium">
              {config.configured
                ? "1. Save a prefix — complete."
                : "1. Save a prefix — action needed. Open Configure to save a prefix."}
            </Text>
          </Inline>
          <Text>
            On Configure, enter demo: in Prefix and choose Save. Wait for Prefix
            saved: the app stores the value and reads it back to confirm it.
            Changing this setting affects subsequent previews for this
            installation. If a prefix is already saved, you can use it instead
            of replacing it with the example.
          </Text>
          <Inline space="space.150" alignBlock="center" shouldWrap>
            <Lozenge appearance="default">Verify manually</Lozenge>
            <Text weight="medium">2. Run a preview</Text>
          </Inline>
          <Text>
            Run a preview — verify manually on Configure. In Preview text, enter
            a space followed by hello and choose Run preview. With demo: saved,
            Preview output should show demo: hello. The app joins the saved
            prefix directly to your sample; it adds no separator automatically.
            Empty text returns just the prefix.
          </Text>
          <Text>
            Preview only displays a result: it does not save the sample, change
            Jira issues, or call an external service. Preview completion is not
            tracked. Open Status to inspect the saved prefix; Refresh checks
            here only rereads configuration, it does not run a preview or test
            HTTP access.
          </Text>
        </Stack>
      )}
      {page === "configure" && (
        <>
          <PrefixForm
            key={config ? `prefix-${formVersion}` : "unavailable"}
            prefix={config?.prefix ?? ""}
            disabled={disabled}
            saving={pending === "save"}
            onSave={save}
          />
          <PreviewForm
            key={`preview-${previewVersion}`}
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
              <Text>
                This is the saved prefix followed directly by your sample text.
                The sample was not saved and no Jira issue was changed. Edit
                Preview text and run again to try another sample; save any
                prefix edits first if you want them included.
              </Text>
              <CodeBlock
                text={output}
                language="text"
                showLineNumbers={false}
                shouldWrapLongLines={false}
              />
            </Stack>
          )}
          <Stack space="space.100">
            <Heading as="h2" size="small">
              Reset demo configuration
            </Heading>
            <Text>
              Remove this installation’s saved prefix to repeat the unconfigured
              verification flow. This cannot be undone; only reset a test
              setting you are authorized to discard. It does not uninstall the
              app.
            </Text>
            {confirmReset ? (
              <>
                <SectionMessage
                  appearance="warning"
                  title="Remove the saved prefix?"
                >
                  <Text>
                    Confirm reset to delete the saved prefix for this
                    installation. Preview will stop working until a new prefix
                    is saved.
                  </Text>
                </SectionMessage>
                <ButtonGroup label="Confirm configuration reset">
                  <Button
                    appearance="danger"
                    isDisabled={pending !== null}
                    onClick={() => {
                      void reset();
                    }}
                  >
                    Confirm reset
                  </Button>
                  <Button
                    isDisabled={pending !== null}
                    onClick={() => setConfirmReset(false)}
                  >
                    Cancel
                  </Button>
                </ButtonGroup>
              </>
            ) : (
              <Button
                appearance="danger"
                isDisabled={disabled || !config?.configured}
                onClick={() => {
                  if (busy.current) return;
                  setSaved(false);
                  setConfirmReset(true);
                }}
              >
                Reset configuration
              </Button>
            )}
          </Stack>
        </>
      )}
      <ButtonGroup label="Admin pages">
        {(["configure", "status", "get-started"] as const)
          .filter((target) => target !== page)
          .map((target) => (
            <Button
              key={target}
              appearance={target === "configure" ? "primary" : "default"}
              isDisabled={pending !== null || confirmReset}
              onClick={() => {
                void navigate(target);
              }}
            >
              {pages[target].label}
            </Button>
          ))}
        {page !== "configure" && (
          <Button
            isDisabled={pending !== null}
            onClick={() => {
              void load();
            }}
          >
            {page === "status" ? "Refresh" : "Refresh checks"}
          </Button>
        )}
      </ButtonGroup>
    </Stack>
  );
}
