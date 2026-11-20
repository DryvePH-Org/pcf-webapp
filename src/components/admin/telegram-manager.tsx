"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";

import { connectTelegramBot, createTelegramLink, unlinkTelegram } from "@/actions/telegram";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type TelegramPerson = { id: string; name: string; role: string; linked: boolean; username: string | null; linkedAt: string | null };
export type TelegramStatus = { configured: boolean; bot: string | null; webhook: string | null; pending: number; error: string | null; expected: string | null };

function PersonRow({ person }: { person: TelegramPerson }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function makeLink() {
    setBusy(true);
    const result = await createTelegramLink({ userId: person.id });
    setBusy(false);
    if (!result.ok) return void toast.error(result.error);
    setLink(result.link);
    setCopied(false);
  }
  async function unlink() {
    if (!window.confirm(`Remove ${person.name}'s Telegram? They will have to be linked again to use the bot.`)) return;
    setBusy(true);
    const result = await unlinkTelegram({ userId: person.id });
    setBusy(false);
    if (!result.ok) return void toast.error(result.error);
    toast.success("Telegram removed");
    setLink(null);
    router.refresh();
  }
  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  }

  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{person.name}</p>
          <p className="text-xs capitalize text-muted-foreground">{person.role}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {person.linked ? (
            <Badge variant="secondary">
              <Check className="mr-1 size-3" />
              Linked{person.username ? ` · @${person.username}` : ""}
            </Badge>
          ) : (
            <Badge variant="outline">Not linked</Badge>
          )}
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void makeLink()}>
            {busy ? <Loader2 className="animate-spin" /> : <Link2 />}
            {person.linked ? "New link" : "Make link"}
          </Button>
          {person.linked ? (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void unlink()}>
              <Unlink />
              Unlink
            </Button>
          ) : null}
        </div>
      </div>
      {link ? (
        <div className="space-y-2 rounded-md bg-muted p-3 text-sm">
          <p>Send this link to {person.name.split(" ")[0]}. They tap it once. It works one time and expires in 7 days.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded border bg-background px-2 py-1 text-xs">{link}</code>
            <Button type="button" size="sm" onClick={() => void copy()}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function TelegramManager({ people, status }: { people: TelegramPerson[]; status: TelegramStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const connected = status.webhook !== null && status.webhook === status.expected;

  async function connect() {
    setBusy(true);
    const result = await connectTelegramBot();
    setBusy(false);
    if (!result.ok) return void toast.error(result.error);
    toast.success("The bot is connected");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            The bot
            {!status.configured ? <Badge variant="destructive">Not set up on the server</Badge> : connected ? <Badge>Connected</Badge> : <Badge variant="outline">Not connected yet</Badge>}
          </CardTitle>
          <CardDescription>
            A requester sends a voice message to the bot, checks the summary it sends back and taps Submit. It becomes an ordinary budget request, under the same rules as one made on the website.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!status.configured ? (
            <Alert variant="destructive">
              <AlertTitle>The server does not have the bot&apos;s settings yet</AlertTitle>
              <AlertDescription>
                Create the bot with @BotFather in Telegram, then add its token and a secret to the server (see docs/ops/phase54-telegram-rollout.md). Nothing here works until then.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <p>
                Bot: {status.bot ? <strong>@{status.bot}</strong> : "could not be reached (check the token)"}
                {status.pending > 0 ? ` · ${status.pending} message${status.pending === 1 ? "" : "s"} waiting` : ""}
              </p>
              {status.error ? <p className="text-destructive">Telegram reported: {status.error}</p> : null}
              {!connected ? (
                <Button type="button" disabled={busy} onClick={() => void connect()}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  Connect the bot to this site
                </Button>
              ) : (
                <p className="text-muted-foreground">Telegram sends its messages to this site.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
          <CardDescription>Make a link for each person who will use Telegram and send it to them. Only linked people can use the bot.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {people.map((person) => (
              <PersonRow key={person.id} person={person} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
