export function DashboardLayout({
  sidebar,
  children,
  isSidebarOpen,
  onCloseSidebar,
}) {
  return (
    <div className="flex flex-1 overflow-hidden">
      
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={onCloseSidebar}
          aria-hidden="true"
        ></div>
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-full max-w-sm transform transition-transform duration-300 ease-in-out bg-white dark:bg-slate-900 
                   md:relative md:w-1/3 md:min-w-[320px] md:max-w-[480px] md:translate-x-0 md:border-r md:border-slate-200 md:dark:border-slate-800
                   ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {sidebar}
      </aside>

      <div className="flex-1 flex flex-col overflow-y-auto">{children}</div>
    </div>
  );
}
