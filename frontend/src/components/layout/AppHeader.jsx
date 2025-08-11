import React, { useState, useEffect, useMemo } from "react";
import { RefreshCw, Loader2, Search, X, Sun, Moon, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshProgress } from "../ui/RefreshProgress";
import Logo from "@/components/Logo";

export function AppHeader({
  loading,
  autoRefresh,
  onRefresh,
  setAutoRefresh,
  searchTerm,
  onSearchChange,
  searchHighlighting,
  onSearchHighlightingChange,
  filters,
  onFilterChange,
  isDarkMode,
  onThemeToggle,
  onGoHome,
  onToggleSidebar,
}) {
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);
  const [searching, setSearching] = useState(false);

  const filterButtons = useMemo(
    () => [
      {
        key: "docker",
        label: "Docker",
        isActive: filters.docker,
        activeClass:
          "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
        onClick: () => onFilterChange({ ...filters, docker: !filters.docker }),
        title: filters.docker
          ? "Disable Docker filter"
          : "Enable Docker filter",
      },
      {
        key: "system",
        label: "System",
        isActive: filters.system,
        activeClass:
          "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
        onClick: () => onFilterChange({ ...filters, system: !filters.system }),
        title: filters.system
          ? "Disable System filter"
          : "Enable System filter",
      },
    ],
    [filters, onFilterChange]
  );

  const searchIcon = useMemo(
    () =>
      searching ? (
        <Loader2 className="h-4 w-4 text-indigo-500 animate-spin" />
      ) : (
        <Search className="h-4 w-4 text-gray-400" />
      ),
    [searching]
  );

  const refreshIcon = useMemo(
    () =>
      loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <RefreshCw className="h-5 w-5" />
      ),
    [loading]
  );

  useEffect(() => {
    if (localSearchTerm !== searchTerm) {
      setSearching(true);
      const debounceTimer = setTimeout(() => {
        onSearchChange(localSearchTerm);
        setSearching(false);
      }, 300);

      return () => {
        clearTimeout(debounceTimer);
        setSearching(false);
      };
    }
  }, [localSearchTerm, searchTerm, onSearchChange]);

  useEffect(() => {
    setLocalSearchTerm(searchTerm);
  }, [searchTerm]);

  const getInputPadding = () => {
    const hasToggle = !!searchTerm;
    const hasClear = !!localSearchTerm;

    if (hasToggle && hasClear) return "pr-20";
    if (hasToggle || hasClear) return "pr-12";
    return "pr-10";
  };

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 relative flex-shrink-0">
      <div className="min-h-16 px-4 sm:px-6 py-2 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <button
            onClick={onToggleSidebar}
            className="p-2 -ml-2 rounded-md md:hidden text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Open sidebar"
          >
            <Menu className="h-6 w-6" />
          </button>
          <button
            onClick={onGoHome}
            className="flex items-center gap-3 text-xl font-bold text-slate-800 dark:text-slate-200 group cursor-pointer"
          >
            <Logo
              className={`h-10 w-10 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all duration-300 ease-in-out group-hover:rotate-[30deg] ${
                loading ? "animate-spin" : ""
              }`}
            />
            <span className="tracking-tighter">portracker</span>
          </button>
        </div>

        <div className="flex items-center flex-wrap justify-center md:justify-end gap-x-4 gap-y-2">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              {searchIcon}
            </div>
            <Input
              type="text"
              placeholder="Search ports, processes..."
              className={`pl-10 ${getInputPadding()} w-64 border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
              value={localSearchTerm}
              onChange={(e) => setLocalSearchTerm(e.target.value)}
            />
            
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 space-x-2">
              
              {searchTerm && (
                <label
                  className="inline-flex items-center cursor-pointer"
                  title="Highlight search matches"
                >
                  <input
                    type="checkbox"
                    checked={searchHighlighting}
                    onChange={(e) =>
                      onSearchHighlightingChange(e.target.checked)
                    }
                    className="sr-only peer"
                  />
                  <div
                    className={`relative w-7 h-4 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-gray-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white ${
                      searchHighlighting
                        ? "bg-indigo-600 dark:bg-indigo-600"
                        : "bg-gray-200 dark:bg-gray-600"
                    }`}
                  ></div>
                </label>
              )}
              
              {localSearchTerm && (
                <button
                  onClick={() => {
                    setLocalSearchTerm("");
                    onSearchChange("");
                  }}
                  title="Clear search"
                  className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex space-x-2">
            {filterButtons.map((filter) => (
              <button
                key={filter.key}
                onClick={filter.onClick}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter.isActive
                    ? filter.activeClass
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
                title={filter.title}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="h-6 border-l border-gray-200 dark:border-gray-700 hidden sm:block"></div>

          
          <label
            className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer"
            title="Toggle auto-refresh"
          >
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="sr-only peer"
            />
            <div
              className={`relative w-9 h-5 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white ${
                autoRefresh
                  ? "bg-indigo-600 dark:bg-indigo-600"
                  : "bg-gray-200 dark:bg-gray-600"
              }`}
            ></div>
            <span>Auto-refresh</span>
          </label>

          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={loading}
            className="hover:bg-gray-100 dark:hover:bg-gray-800"
            title={loading ? "Refreshing..." : "Refresh all data"}
          >
            {refreshIcon}
          </Button>

          <div className="h-6 border-l border-gray-200 dark:border-gray-700 hidden sm:block"></div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onThemeToggle}
            className="hover:bg-gray-100 dark:hover:bg-gray-800"
            title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDarkMode ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {autoRefresh && (
        <div className="absolute bottom-0 left-0 right-0">
          <RefreshProgress active={autoRefresh} duration={30000} />
        </div>
      )}
    </header>
  );
}
