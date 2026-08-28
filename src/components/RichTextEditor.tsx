import React, { useRef, useEffect, useState } from 'react';
import {
    Bold, Italic, Underline, Strikethrough,
    AlignLeft, AlignCenter, AlignRight, AlignJustify,
    List, ListOrdered, RemoveFormatting,
    Undo, Redo
} from 'lucide-react';

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    minHeight?: string;
    className?: string;
}

export function RichTextEditor({
    value,
    onChange,
    placeholder = 'Enter content...',
    minHeight = '120px',
    className = ''
}: RichTextEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null);
    const isInternalChange = useRef(false);
    const [isFocused, setIsFocused] = useState(false);

    // Sync external value changes to innerHTML
    useEffect(() => {
        if (editorRef.current && !isInternalChange.current) {
            if (editorRef.current.innerHTML !== (value || '')) {
                editorRef.current.innerHTML = value || '';
            }
        }
        isInternalChange.current = false;
    }, [value]);

    const handleInput = () => {
        if (editorRef.current) {
            isInternalChange.current = true;
            const html = editorRef.current.innerHTML;
            onChange(html === '<br>' ? '' : html);
        }
    };

    const exec = (command: string, val: string | undefined = undefined) => {
        if (editorRef.current) {
            editorRef.current.focus();
        }
        document.execCommand(command, false, val);
        handleInput();
    };

    const handleFontSize = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const size = e.target.value;
        if (!size) return;
        exec('fontSize', size);
        e.target.value = '';
    };

    const handleFontFamily = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const font = e.target.value;
        if (!font) return;
        exec('fontName', font);
        e.target.value = '';
    };

    const handleColor = (color: string) => {
        exec('foreColor', color);
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
        e.preventDefault();
        const clipboardData = e.clipboardData;
        const htmlData = clipboardData.getData('text/html');
        const textData = clipboardData.getData('text/plain');

        let cleanContent = '';

        if (htmlData && htmlData.trim()) {
            try {
                // Parse pasted HTML to strip inline styles, scripts, class attributes that break dark mode / themes
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlData, 'text/html');
                
                // Remove harmful tags
                doc.querySelectorAll('script, style, meta, link, title, iframe').forEach(el => el.remove());

                // Clean attributes while keeping clean HTML tags (b, i, u, p, br, ul, ol, li, table, tr, td, th, etc.)
                doc.querySelectorAll('*').forEach(el => {
                    el.removeAttribute('style');
                    el.removeAttribute('class');
                    el.removeAttribute('id');
                    el.removeAttribute('align');
                    el.removeAttribute('color');
                    el.removeAttribute('bgcolor');
                });

                cleanContent = doc.body.innerHTML;
            } catch (err) {
                console.error('Error parsing pasted HTML:', err);
                cleanContent = '';
            }
        }

        // Fallback to textData if htmlData parsing yielded nothing or plain text was copied
        if (!cleanContent && textData) {
            cleanContent = textData
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\r\n/g, '<br>')
                .replace(/\n/g, '<br>');
        }

        if (cleanContent) {
            // Ensure editor element is focused
            if (editorRef.current) {
                editorRef.current.focus();
            }

            // Insert cleaned content at current cursor position
            if (document.queryCommandSupported('insertHTML')) {
                document.execCommand('insertHTML', false, cleanContent);
            } else {
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    range.deleteContents();
                    const div = document.createElement('div');
                    div.innerHTML = cleanContent;
                    const frag = document.createDocumentFragment();
                    let node;
                    let lastNode;
                    while ((node = div.firstChild)) {
                        lastNode = frag.appendChild(node);
                    }
                    range.insertNode(frag);
                    if (lastNode) {
                        range.setStartAfter(lastNode);
                        range.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                }
            }
            // Trigger input state change
            handleInput();
        }
    };

    const preventBlur = (e: React.MouseEvent) => {
        e.preventDefault();
    };

    const isEmpty = !value || value === '<br>' || value === '<p><br></p>' || value.trim() === '';

    return (
        <div className={`border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-700 transition-all ${isFocused ? 'ring-2 ring-indigo-500 border-indigo-500' : ''} ${className}`}>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-1 p-2 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-600 print:hidden select-none">
                {/* Undo / Redo Group */}
                <div className="flex items-center space-x-0.5 border-r border-gray-200 dark:border-gray-700 pr-1.5 mr-1">
                    <button
                        type="button"
                        onMouseDown={preventBlur}
                        onClick={() => exec('undo')}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition"
                        title="Undo (Ctrl+Z)"
                    >
                        <Undo className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onMouseDown={preventBlur}
                        onClick={() => exec('redo')}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition"
                        title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
                    >
                        <Redo className="w-4 h-4" />
                    </button>
                </div>

                {/* Font Family Dropdown */}
                <div className="flex items-center space-x-1 border-r border-gray-200 dark:border-gray-700 pr-1.5 mr-1">
                    <select
                        onChange={handleFontFamily}
                        defaultValue=""
                        className="text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 outline-none cursor-pointer"
                        title="Font Family"
                    >
                        <option value="" disabled>Font</option>
                        <option value="Roboto, sans-serif">Roboto</option>
                        <option value="Inter, sans-serif">Inter</option>
                        <option value="Arial, sans-serif">Arial</option>
                        <option value="Georgia, serif">Georgia</option>
                        <option value="Courier New, monospace">Monospace</option>
                    </select>
                </div>

                {/* Font Size Dropdown */}
                <div className="flex items-center space-x-1 border-r border-gray-200 dark:border-gray-700 pr-1.5 mr-1">
                    <select
                        onChange={handleFontSize}
                        defaultValue=""
                        className="text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 outline-none cursor-pointer"
                        title="Font Size"
                    >
                        <option value="" disabled>Size</option>
                        <option value="1">Small</option>
                        <option value="3">Normal</option>
                        <option value="4">Medium</option>
                        <option value="5">Large</option>
                        <option value="6">X-Large</option>
                    </select>
                </div>

                {/* Text Formatting Group */}
                <div className="flex items-center space-x-0.5 border-r border-gray-200 dark:border-gray-700 pr-1.5 mr-1">
                    <button
                        type="button"
                        onMouseDown={preventBlur}
                        onClick={() => exec('bold')}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition"
                        title="Bold (Ctrl+B)"
                    >
                        <Bold className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onMouseDown={preventBlur}
                        onClick={() => exec('italic')}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition"
                        title="Italic (Ctrl+I)"
                    >
                        <Italic className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onMouseDown={preventBlur}
                        onClick={() => exec('underline')}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition"
                        title="Underline (Ctrl+U)"
                    >
                        <Underline className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onMouseDown={preventBlur}
                        onClick={() => exec('strikeThrough')}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition"
                        title="Strikethrough"
                    >
                        <Strikethrough className="w-4 h-4" />
                    </button>
                </div>

                {/* Alignment Group */}
                <div className="flex items-center space-x-0.5 border-r border-gray-200 dark:border-gray-700 pr-1.5 mr-1">
                    <button
                        type="button"
                        onMouseDown={preventBlur}
                        onClick={() => exec('justifyLeft')}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition"
                        title="Align Left"
                    >
                        <AlignLeft className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onMouseDown={preventBlur}
                        onClick={() => exec('justifyCenter')}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition"
                        title="Align Center"
                    >
                        <AlignCenter className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onMouseDown={preventBlur}
                        onClick={() => exec('justifyRight')}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition"
                        title="Align Right"
                    >
                        <AlignRight className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onMouseDown={preventBlur}
                        onClick={() => exec('justifyFull')}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition"
                        title="Justify"
                    >
                        <AlignJustify className="w-4 h-4" />
                    </button>
                </div>

                {/* Lists Group */}
                <div className="flex items-center space-x-0.5 border-r border-gray-200 dark:border-gray-700 pr-1.5 mr-1">
                    <button
                        type="button"
                        onMouseDown={preventBlur}
                        onClick={() => exec('insertUnorderedList')}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition"
                        title="Bullet List"
                    >
                        <List className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onMouseDown={preventBlur}
                        onClick={() => exec('insertOrderedList')}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition"
                        title="Numbered List"
                    >
                        <ListOrdered className="w-4 h-4" />
                    </button>
                </div>

                {/* Quick Color Palette */}
                <div className="flex items-center space-x-1 border-r border-gray-200 dark:border-gray-700 pr-1.5 mr-1">
                    <button
                        type="button"
                        onMouseDown={preventBlur}
                        onClick={() => handleColor('#111827')}
                        className="w-4 h-4 rounded-full bg-gray-900 border border-gray-300 hover:scale-110 transition"
                        title="Black Text"
                    />
                    <button
                        type="button"
                        onMouseDown={preventBlur}
                        onClick={() => handleColor('#dc2626')}
                        className="w-4 h-4 rounded-full bg-red-600 hover:scale-110 transition"
                        title="Red Text"
                    />
                    <button
                        type="button"
                        onMouseDown={preventBlur}
                        onClick={() => handleColor('#2563eb')}
                        className="w-4 h-4 rounded-full bg-blue-600 hover:scale-110 transition"
                        title="Blue Text"
                    />
                    <button
                        type="button"
                        onMouseDown={preventBlur}
                        onClick={() => handleColor('#059669')}
                        className="w-4 h-4 rounded-full bg-emerald-600 hover:scale-110 transition"
                        title="Green Text"
                    />
                    <button
                        type="button"
                        onMouseDown={preventBlur}
                        onClick={() => handleColor('#d97706')}
                        className="w-4 h-4 rounded-full bg-amber-600 hover:scale-110 transition"
                        title="Amber Text"
                    />
                </div>

                {/* Clear Formatting */}
                <button
                    type="button"
                    onMouseDown={preventBlur}
                    onClick={() => exec('removeFormat')}
                    className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition ml-auto"
                    title="Clear Formatting"
                >
                    <RemoveFormatting className="w-4 h-4 text-rose-500" />
                </button>
            </div>

            {/* Editable Canvas */}
            <div className="relative p-3">
                {isEmpty && !isFocused && (
                    <div className="absolute top-3 left-3 pointer-events-none text-sm text-gray-400 dark:text-gray-500 select-none">
                        {placeholder}
                    </div>
                )}
                <div
                    ref={editorRef}
                    contentEditable
                    onInput={handleInput}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => {
                        setIsFocused(false);
                        handleInput();
                    }}
                    onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y')) {
                            setTimeout(handleInput, 0);
                        }
                    }}
                    onPaste={handlePaste}
                    className="outline-none text-sm text-gray-900 dark:text-white leading-relaxed min-w-full overflow-y-auto rich-text-content"
                    style={{ minHeight }}
                />
            </div>
        </div>
    );
}
