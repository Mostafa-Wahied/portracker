/**
 * Shared styling for modals across the application
 * Used by both Dialog and AlertDialog components
 */
export const modalStyles = {
  overlay: "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity",
  content: "fixed top-[50%] left-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-lg transition-all",
  title: "text-lg font-semibold text-gray-900 dark:text-gray-100",
  description: "text-sm text-gray-500 dark:text-gray-400 mt-2",
  footer: "flex justify-end space-x-3 mt-6",
  closeButton: "absolute top-3.5 right-3.5 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none cursor-pointer",
  input: "mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
}