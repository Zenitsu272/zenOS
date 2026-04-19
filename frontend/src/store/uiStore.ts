import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark";
type View = "today" | "long-term" | "board" | "completed";

interface UiState {
  theme: Theme;
  activeView: View;
  search: string;
  sidebarOpen: boolean;
  selectedCategoryId: number | null;
  selectedSubbranchId: number | null;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setActiveView: (view: View) => void;
  setSearch: (search: string) => void;
  setSidebarOpen: (open: boolean) => void;
  setSelectedCategoryId: (id: number | null) => void;
  setSelectedSubbranchId: (id: number | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: "light",
      activeView: "today",
      search: "",
      sidebarOpen: false,
      selectedCategoryId: null,
      selectedSubbranchId: null,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      setActiveView: (activeView) => set({ activeView }),
      setSearch: (search) => set({ search }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setSelectedCategoryId: (selectedCategoryId) => set({ selectedCategoryId, selectedSubbranchId: null }),
      setSelectedSubbranchId: (selectedSubbranchId) => set({ selectedSubbranchId })
    }),
    {
      name: "zenos_ui"
    }
  )
);
