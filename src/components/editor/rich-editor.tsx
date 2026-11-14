"use client";
import * as React from "react";
import { useEditor, EditorContent, type Editor, ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import Image from "@tiptap/extension-image";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { createLowlight } from "lowlight";
import { common } from "lowlight";
import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
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
  Table as TableIcon,
  Image as ImageIcon,
  Trash2,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

const lowlight = createLowlight(common);

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
        codeBlock: false,
        horizontalRule: false,
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: "text",
        HTMLAttributes: {
          class: "rounded-md border border-border bg-surface-2 p-3 font-mono text-xs",
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
        HTMLAttributes: {
          class: "text-primary underline-offset-2 hover:underline",
          rel: "noreferrer",
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({
        allowBase64: true,
        HTMLAttributes: { class: "max-w-full rounded-md border border-border" },
      }),
      SlashCommands,
    ],
    content: value,
    editorProps: {
      attributes: {
        class: cn(
          "focus:outline-none max-w-none",
          minHeightClass,
          "px-5 py-4 text-sm leading-relaxed",
        ),
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
      <div
        className={cn(
          "border-border bg-card text-muted-foreground rounded-lg border p-4 text-xs",
          className,
        )}
      >
        Loading editor…
      </div>
    );
  }

  return (
    <div className={cn("border-border bg-card rounded-lg border", className)}>
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
  const groups: Array<
    Array<{
      id: string;
      icon: React.ComponentType<{ className?: string }>;
      label: string;
      isActive: () => boolean;
      run: () => void;
      disabled?: boolean;
    }>
  > = [
    [
      {
        id: "h1",
        icon: Heading1,
        label: "Heading 1",
        isActive: () => editor.isActive("heading", { level: 1 }),
        run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        id: "h2",
        icon: Heading2,
        label: "Heading 2",
        isActive: () => editor.isActive("heading", { level: 2 }),
        run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        id: "h3",
        icon: Heading3,
        label: "Heading 3",
        isActive: () => editor.isActive("heading", { level: 3 }),
        run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      },
    ],
    [
      {
        id: "bold",
        icon: Bold,
        label: "Bold",
        isActive: () => editor.isActive("bold"),
        run: () => editor.chain().focus().toggleBold().run(),
      },
      {
        id: "italic",
        icon: Italic,
        label: "Italic",
        isActive: () => editor.isActive("italic"),
        run: () => editor.chain().focus().toggleItalic().run(),
      },
      {
        id: "strike",
        icon: Strikethrough,
        label: "Strikethrough",
        isActive: () => editor.isActive("strike"),
        run: () => editor.chain().focus().toggleStrike().run(),
      },
      {
        id: "code",
        icon: CodeIcon,
        label: "Inline code",
        isActive: () => editor.isActive("code"),
        run: () => editor.chain().focus().toggleCode().run(),
      },
    ],
    [
      {
        id: "ul",
        icon: ListIcon,
        label: "Bulleted list",
        isActive: () => editor.isActive("bulletList"),
        run: () => editor.chain().focus().toggleBulletList().run(),
      },
      {
        id: "ol",
        icon: ListOrdered,
        label: "Numbered list",
        isActive: () => editor.isActive("orderedList"),
        run: () => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        id: "task",
        icon: ListChecks,
        label: "Task list",
        isActive: () => editor.isActive("taskList"),
        run: () => editor.chain().focus().toggleTaskList().run(),
      },
      {
        id: "quote",
        icon: Quote,
        label: "Quote",
        isActive: () => editor.isActive("blockquote"),
        run: () => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        id: "codeblock",
        icon: Code2,
        label: "Code block",
        isActive: () => editor.isActive("codeBlock"),
        run: () => editor.chain().focus().toggleCodeBlock().run(),
      },
      {
        id: "hr",
        icon: Minus,
        label: "Divider",
        isActive: () => false,
        run: () => editor.chain().focus().setHorizontalRule().run(),
      },
    ],
    [
      {
        id: "table",
        icon: TableIcon,
        label: "Insert table",
        isActive: () => editor.isActive("table"),
        run: () =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      },
      {
        id: "add-column",
        icon: Plus,
        label: "Add column",
        isActive: () => false,
        run: () => editor.chain().focus().addColumnAfter().run(),
        disabled: !editor.isActive("table"),
      },
      {
        id: "add-row",
        icon: Plus,
        label: "Add row",
        isActive: () => false,
        run: () => editor.chain().focus().addRowAfter().run(),
        disabled: !editor.isActive("table"),
      },
      {
        id: "delete-table",
        icon: Trash2,
        label: "Delete table",
        isActive: () => false,
        run: () => editor.chain().focus().deleteTable().run(),
        disabled: !editor.isActive("table"),
      },
      {
        id: "image",
        icon: ImageIcon,
        label: "Insert image",
        isActive: () => false,
        run: () => {
          const url = window.prompt("Image URL");
          if (url) editor.chain().focus().setImage({ src: url }).run();
        },
      },
    ],
    [
      {
        id: "link",
        icon: LinkIcon,
        label: "Link / wiki-link",
        isActive: () => editor.isActive("link"),
        run: onOpenLink,
      },
      {
        id: "undo",
        icon: Undo2,
        label: "Undo",
        isActive: () => false,
        run: () => editor.chain().focus().undo().run(),
        disabled: !editor.can().undo(),
      },
      {
        id: "redo",
        icon: Redo2,
        label: "Redo",
        isActive: () => false,
        run: () => editor.chain().focus().redo().run(),
        disabled: !editor.can().redo(),
      },
    ],
  ];

  return (
    <div className="border-border bg-card/80 sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b px-2 py-1.5 backdrop-blur">
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
          {gi < groups.length - 1 && <span className="bg-border mx-1 h-5 w-px" />}
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
        "text-muted-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
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
    <div className="border-border bg-surface-2 flex items-center gap-2 border-t px-3 py-2">
      <LinkIcon className="text-muted-foreground h-3.5 w-3.5" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://… or [[Wiki link target]]"
        className="border-border bg-background focus-visible:ring-ring h-7 flex-1 rounded-md border px-2 text-xs outline-none focus-visible:ring-2"
      />
      <button
        type="button"
        onClick={onApply}
        className="bg-primary text-primary-foreground rounded-md px-2.5 py-1 text-xs font-medium hover:opacity-90"
      >
        Apply
      </button>
      <button
        type="button"
        onClick={onClose}
        className="border-border hover:bg-accent rounded-md border px-2.5 py-1 text-xs"
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
      const marks =
        (
          node as unknown as {
            marks?: Array<{ type: { name: string }; attrs?: Record<string, unknown> }>;
          }
        ).marks ?? [];
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
    if (node.type?.name === "image") {
      const src = (node.attrs?.src as string) ?? "";
      const alt = (node.attrs?.alt as string) ?? "";
      return `![${alt}](${src})`;
    }
    let out = "";
    node.forEach((c) => {
      out += renderInline(c);
    });
    return out;
  };

  const renderChildren = (
    node: NonNullable<ReturnType<Editor["state"]["doc"]["copy"]>["firstChild"]>,
  ): string => {
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
    if (name === "table") {
      let header: string[] = [];
      const rows: string[][] = [];
      node.forEach((row) => {
        const cells: string[] = [];
        row.forEach((cell) => {
          cells.push(renderInline(cell).trim().replace(/\|/g, "\\|"));
        });
        if (row.firstChild?.type.name === "tableHeader") {
          header = cells;
        } else {
          rows.push(cells);
        }
      });
      if (header.length === 0) return "";
      const sep = header.map(() => "---").join(" | ");
      const body = rows.map((r) => r.join(" | ")).join("\n");
      return `${header.join(" | ")}\n${sep}${body ? "\n" + body : ""}`;
    }
    return renderInline(node).trim();
  };

  editor.state.doc.forEach((node) => {
    const block = renderBlock(node);
    if (block) lines.push(block);
  });

  return lines.join("\n\n").trim() + "\n";
}

const slashCommands = [
  {
    id: "h1",
    label: "Heading 1",
    icon: Heading1,
    command: ({ editor }: { editor: Editor }) =>
      editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: "h2",
    label: "Heading 2",
    icon: Heading2,
    command: ({ editor }: { editor: Editor }) =>
      editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    label: "Heading 3",
    icon: Heading3,
    command: ({ editor }: { editor: Editor }) =>
      editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: "bullet",
    label: "Bullet list",
    icon: ListIcon,
    command: ({ editor }: { editor: Editor }) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: "ordered",
    label: "Numbered list",
    icon: ListOrdered,
    command: ({ editor }: { editor: Editor }) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "task",
    label: "Task list",
    icon: ListChecks,
    command: ({ editor }: { editor: Editor }) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    id: "quote",
    label: "Quote",
    icon: Quote,
    command: ({ editor }: { editor: Editor }) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "code",
    label: "Code block",
    icon: Code2,
    command: ({ editor }: { editor: Editor }) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "table",
    label: "Table",
    icon: TableIcon,
    command: ({ editor }: { editor: Editor }) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: "image",
    label: "Image",
    icon: ImageIcon,
    command: ({ editor }: { editor: Editor }) => {
      const url = window.prompt("Image URL");
      if (url) editor.chain().focus().setImage({ src: url }).run();
    },
  },
  {
    id: "divider",
    label: "Divider",
    icon: Minus,
    command: ({ editor }: { editor: Editor }) => editor.chain().focus().setHorizontalRule().run(),
  },
];

const SlashCommands = Extension.create({
  name: "slashCommands",
  addOptions() {
    return {
      suggestion: {
        char: "/",
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: { from: number; to: number };
          props: { id: string };
        }) => {
          editor.chain().focus().deleteRange(range).run();
          const item = slashCommands.find((c) => c.id === props.id);
          item?.command({ editor });
        },
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }: { query: string }) =>
          slashCommands
            .filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 10),
        render: () => {
          let component: ReactRenderer | null = null;
          let popup: HTMLDivElement | null = null;
          return {
            onStart: (props: { editor: Editor; clientRect: (() => DOMRect | null) | null }) => {
              const container = document.createElement("div");
              container.className = "fixed z-50";
              const rect = props.clientRect?.();
              if (rect) {
                container.style.left = `${rect.left}px`;
                container.style.top = `${rect.bottom + 4}px`;
              }
              component = new ReactRenderer(SlashCommandMenu, {
                props: { ...props, items: slashCommands },
                editor: props.editor,
              });
              container.appendChild(component.element as Node);
              document.body.appendChild(container);
              popup = container;
            },
            onUpdate(props: { editor: Editor; clientRect: (() => DOMRect | null) | null }) {
              component?.updateProps({ ...props, items: slashCommands });
              const rect = props.clientRect?.();
              if (popup && rect) {
                popup.style.left = `${rect.left}px`;
                popup.style.top = `${rect.bottom + 4}px`;
              }
            },
            onKeyDown(props: { event: KeyboardEvent }) {
              return (
                (
                  component?.ref as unknown as { onKeyDown?: (e: KeyboardEvent) => boolean }
                )?.onKeyDown?.(props.event) ?? false
              );
            },
            onExit() {
              popup?.remove();
              component?.destroy();
              popup = null;
              component = null;
            },
          };
        },
      }),
    ];
  },
});

function SlashCommandMenu({
  items,
  command,
}: {
  items: typeof slashCommands;
  command: (item: { id: string }) => void;
}) {
  const [selectedRaw, setSelected] = React.useState(0);
  const filtered = items;
  const selected = Math.min(selectedRaw, Math.max(filtered.length - 1, 0));
  const onKeyDown = React.useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => (s + 1) % filtered.length);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => (s - 1 + filtered.length) % filtered.length);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[selected];
        if (item) command({ id: item.id });
      }
      if (e.key === "Escape") {
        e.preventDefault();
        command({ id: "" });
      }
    },
    [filtered, selected, command],
  );
  React.useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);
  if (filtered.length === 0)
    return (
      <div className="border-border bg-popover text-muted-foreground rounded-md border p-2 text-xs shadow-md">
        No commands
      </div>
    );
  return (
    <div className="border-border bg-popover w-56 overflow-hidden rounded-md border shadow-md">
      {filtered.map((item, i) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => command({ id: item.id })}
            className={cn(
              "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors",
              i === selected
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            <Icon className="h-3.5 w-3.5" /> {item.label}
          </button>
        );
      })}
    </div>
  );
}
