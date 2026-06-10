"use client";
import * as React from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  Bold,
  Italic,
  Strikethrough,
  Code as CodeIcon,
  Code2,
  List as ListIcon,
  ListOrdered,
  ListChecks,
  Quote,
  Link as LinkIcon,
  Heading1,
  Heading2,
  Heading3,
  Undo2,
  Redo2,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RichEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  className?: string;
  minHeightClass?: string;
  ariaLabel?: string;
}

export function RichEditor({
  value,
  onChange,
  placeholder = "Start writing…",
  className,
  minHeightClass = "min-h-[420px]",
  ariaLabel = "Rich text editor",
}: RichEditorProps) {
  const lastEmittedRef = React.useRef<string>(value);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkValue, setLinkValue] = React.useState("");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: {
          HTMLAttributes: { class: "rounded-md border border-border bg-surface-2 p-3 font-mono text-xs" },
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass:
          "before:pointer-events-none before:float-left before:h-0 before:text-muted-foreground before:content-[attr(data-placeholder)]",
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: "text-primary underline-offset-2 hover:underline", rel: "noreferrer" },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: cn("focus:outline-none max-w-none", minHeightClass, "px-5 py-4 text-sm leading-relaxed"),
        "aria-label": ariaLabel,
      },
    },
    onUpdate: ({ editor }) => {
      const md = editorToMarkdown(editor);
      lastEmittedRef.current = md;
      onChange(md);
    },
  });

  React.useEffect(() => {
    if (!editor) return;
    const current = editorToMarkdown(editor);
    if (value !== current && value !== lastEmittedRef.current) {
      editor.commands.setContent(value, { emitUpdate: false });
      lastEmittedRef.current = value;
    }
  }, [value, editor]);

  const openLinkDialog = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    setLinkValue(prev ?? "");
    setLinkOpen(true);
  };

  const applyLink = () => {
    if (!editor) return;
    if (linkValue.trim() === "") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: linkValue.trim() }).run();
    }
    setLinkOpen(false);
    setLinkValue("");
  };

  if (!editor) {
    return (
      <div className={cn("rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground", className)}>
        Loading editor…
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-border bg-card", className)}>
      <Toolbar editor={editor} onOpenLink={openLinkDialog} />
      <EditorContent editor={editor} />
      {linkOpen && (
        <LinkBar
          value={linkValue}
          onChange={setLinkValue}
          onApply={applyLink}
          onClose={() => setLinkOpen(false)}
        />
      )}
    </div>
  );
}

function Toolbar({ editor, onOpenLink }: { editor: Editor; onOpenLink: () => void }) {
  const groups: Array<Array<{ id: string; icon: React.ComponentType<{ className?: string }>; label: string; isActive: () => boolean; run: () => void; disabled?: boolean }>> = [
    [
      { id: "h1", icon: Heading1, label: "Heading 1", isActive: () => editor.isActive("heading", { level: 1 }), run: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
      { id: "h2", icon: Heading2, label: "Heading 2", isActive: () => editor.isActive("heading", { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
      { id: "h3", icon: Heading3, label: "Heading 3", isActive: () => editor.isActive("heading", { level: 3 }), run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    ],
    [
      { id: "bold", icon: Bold, label: "Bold", isActive: () => editor.isActive("bold"), run: () => editor.chain().focus().toggleBold().run() },
      { id: "italic", icon: Italic, label: "Italic", isActive: () => editor.isActive("italic"), run: () => editor.chain().focus().toggleItalic().run() },
      { id: "strike", icon: Strikethrough, label: "Strikethrough", isActive: () => editor.isActive("strike"), run: () => editor.chain().focus().toggleStrike().run() },
      { id: "code", icon: CodeIcon, label: "Inline code", isActive: () => editor.isActive("code"), run: () => editor.chain().focus().toggleCode().run() },
    ],
    [
      { id: "ul", icon: ListIcon, label: "Bulleted list", isActive: () => editor.isActive("bulletList"), run: () => editor.chain().focus().toggleBulletList().run() },
      { id: "ol", icon: ListOrdered, label: "Numbered list", isActive: () => editor.isActive("orderedList"), run: () => editor.chain().focus().toggleOrderedList().run() },
      { id: "task", icon: ListChecks, label: "Task list", isActive: () => editor.isActive("taskList"), run: () => editor.chain().focus().toggleTaskList().run() },
      { id: "quote", icon: Quote, label: "Quote", isActive: () => editor.isActive("blockquote"), run: () => editor.chain().focus().toggleBlockquote().run() },
      { id: "codeblock", icon: Code2, label: "Code block", isActive: () => editor.isActive("codeBlock"), run: () => editor.chain().focus().toggleCodeBlock().run() },
      { id: "hr", icon: Minus, label: "Divider", isActive: () => false, run: () => editor.chain().focus().setHorizontalRule().run() },
    ],
    [
      { id: "link", icon: LinkIcon, label: "Link / wiki-link", isActive: () => editor.isActive("link"), run: onOpenLink },
      { id: "undo", icon: Undo2, label: "Undo", isActive: () => false, run: () => editor.chain().focus().undo().run(), disabled: !editor.can().undo() },
      { id: "redo", icon: Redo2, label: "Redo", isActive: () => false, run: () => editor.chain().focus().redo().run(), disabled: !editor.can().redo() },
    ],
  ];

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-border bg-card/80 px-2 py-1.5 backdrop-blur">
      {groups.map((g, gi) => (
        <div key={gi} className="flex items-center gap-0.5">
          {g.map((b) => {
            const Icon = b.icon;
            return (
              <ToolbarButton
                key={b.id}
                label={b.label}
                active={b.isActive()}
                onClick={b.run}
                disabled={b.disabled ?? false}
              >
                <Icon className="h-3.5 w-3.5" />
              </ToolbarButton>
            );
          })}
          {gi < groups.length - 1 && <span className="mx-1 h-5 w-px bg-border" />}
        </div>
      ))}
    </div>
  );
}

function ToolbarButton({
  children,
  active,
  disabled,
  onClick,
  label,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
        active && "bg-accent text-foreground",
        !active && "hover:bg-accent/60 hover:text-foreground",
        disabled && "opacity-40",
      )}
    >
      {children}
    </button>
  );
}

function LinkBar({
  value,
  onChange,
  onApply,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") onApply();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onApply, onClose]);
  return (
    <div className="flex items-center gap-2 border-t border-border bg-surface-2 px-3 py-2">
      <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://… or [[Wiki link target]]"
        className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="button"
        onClick={onApply}
        className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
      >
        Apply
      </button>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent"
      >
        Cancel
      </button>
    </div>
  );
}

function editorToMarkdown(editor: Editor): string {
  const text = editor.getText();
  void text;
  const lines: string[] = [];
  const renderInline = (node: ReturnType<Editor["state"]["doc"]["copy"]>["firstChild"]): string => {
    if (!node) return "";
    if (node.type?.name === "text") {
      let t = node.text ?? "";
      const marks = (node as unknown as { marks?: Array<{ type: { name: string }; attrs?: Record<string, unknown> }> }).marks ?? [];
      for (const m of marks) {
        const name = m.type?.name;
        if (name === "bold") t = `**${t}**`;
        else if (name === "italic") t = `*${t}*`;
        else if (name === "strike") t = `~~${t}~~`;
        else if (name === "code") t = `\`${t}\``;
        else if (name === "link") {
          const href = (m.attrs?.href as string) ?? "";
          t = `[${t}](${href})`;
        }
      }
      return t;
    }
    if (node.type?.name === "hardBreak") return "  \n";
    let out = "";
    node.forEach((c) => {
      out += renderInline(c);
    });
    return out;
  };

  const renderChildren = (node: NonNullable<ReturnType<Editor["state"]["doc"]["copy"]>["firstChild"]>): string => {
    let out = "";
    node.forEach((c) => {
      out += renderBlock(c);
    });
    return out;
  };

  const renderBlock = (node: ReturnType<Editor["state"]["doc"]["copy"]>["firstChild"]): string => {
    if (!node) return "";
    const name = node.type?.name;
    if (name === "heading") {
      const lvl = (node.attrs?.level as number) ?? 1;
      return `${"#".repeat(lvl)} ${renderInline(node).trim()}`;
    }
    if (name === "paragraph") {
      return renderInline(node).trim();
    }
    if (name === "blockquote") {
      const inner = renderChildren(node).trim().split("\n");
      return inner.map((l) => `> ${l}`).join("\n");
    }
    if (name === "bulletList") {
      let out = "";
      node.forEach((li) => {
        out += `- ${renderInline(li).trim()}\n`;
      });
      return out.replace(/\n$/, "");
    }
    if (name === "orderedList") {
      let out = "";
      let i = 1;
      node.forEach((li) => {
        out += `${i}. ${renderInline(li).trim()}\n`;
        i++;
      });
      return out.replace(/\n$/, "");
    }
    if (name === "taskList") {
      let out = "";
      node.forEach((li) => {
        const checked = li.attrs?.checked ? "x" : " ";
        out += `- [${checked}] ${renderInline(li).trim()}\n`;
      });
      return out.replace(/\n$/, "");
    }
    if (name === "codeBlock") {
      const lang = (node.attrs?.language as string) ?? "";
      const text = (node as unknown as { textContent?: string }).textContent ?? "";
      return `\`\`\`${lang}\n${text}\n\`\`\``;
    }
    if (name === "horizontalRule") {
      return "---";
    }
    if (name === "listItem") {
      return `- ${renderInline(node).trim()}`;
    }
    return renderInline(node).trim();
  };

  editor.state.doc.forEach((node) => {
    const block = renderBlock(node);
    if (block) lines.push(block);
  });

  return lines.join("\n\n").trim() + "\n";
}
