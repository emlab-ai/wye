'use client';
import { createContext } from 'react';
// The node whose content a DocEditor edits (decision:wf2.content-editor-scoped); null on a document page. Its own
// module so a block component can read it without importing the editor (which imports the blocks).
export const EditorScope = createContext<string | null>(null);
// The page a DocEditor edits (folder and slug): what a table on it names as `page = …` (decision:wf2.table-is-sql)
export const EditorDoc = createContext<{ project: string; slug: string } | null>(null);
