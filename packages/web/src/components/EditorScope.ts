'use client';
import { createContext } from 'react';
// The node whose content a DocEditor edits (decision:wf2.content-editor-scoped); null on a document page. Its own
// module so a block component can read it without importing the editor (which imports the blocks).
export const EditorScope = createContext<string | null>(null);
