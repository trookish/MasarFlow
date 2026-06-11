import { create } from "zustand";

interface CreateDialogsState {
  note: boolean;
  spec: boolean;
  task: boolean;
  log: boolean;
  doc: boolean;
  standard: boolean;
  setNote: (v: boolean) => void;
  setSpec: (v: boolean) => void;
  setTask: (v: boolean) => void;
  setLog: (v: boolean) => void;
  setDoc: (v: boolean) => void;
  setStandard: (v: boolean) => void;
}

export const useCreateDialogs = create<CreateDialogsState>((set) => ({
  note: false,
  spec: false,
  task: false,
  log: false,
  doc: false,
  standard: false,
  setNote: (v) => set({ note: v }),
  setSpec: (v) => set({ spec: v }),
  setTask: (v) => set({ task: v }),
  setLog: (v) => set({ log: v }),
  setDoc: (v) => set({ doc: v }),
  setStandard: (v) => set({ standard: v }),
}));

export const setOpenNewNote = (v: boolean) => useCreateDialogs.getState().setNote(v);
export const setOpenNewSpec = (v: boolean) => useCreateDialogs.getState().setSpec(v);
export const setOpenNewTask = (v: boolean) => useCreateDialogs.getState().setTask(v);
export const setOpenNewLog = (v: boolean) => useCreateDialogs.getState().setLog(v);
export const setOpenNewDoc = (v: boolean) => useCreateDialogs.getState().setDoc(v);
export const setOpenNewStandard = (v: boolean) => useCreateDialogs.getState().setStandard(v);
