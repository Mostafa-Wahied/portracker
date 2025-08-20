import { Check, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function ActionButton({
  type,
  itemKey,
  actionFeedback,
  onClick,
  icon: Icon,
  title,
  loading = false,
  size = "md",
}) {
  const feedback = actionFeedback[type];
  const wasClicked = feedback && feedback.id === itemKey;
  const isLoading =
    loading &&
    feedback &&
    feedback.id === itemKey &&
    feedback.status === "loading";

  const sizeClasses = {
    md: "p-2",
    sm: "p-1.5",
  };

  const iconSizeClasses = {
    md: "h-4 w-4",
    sm: "h-3.5 w-3.5",
  };

  const baseClasses = "relative rounded-md transition-all duration-200 transform";

  const colorClasses = wasClicked
    ? "bg-green-100 text-green-700 dark:bg-green-800/50 dark:text-green-300 scale-105"
    : isLoading
    ? "bg-blue-100 text-blue-600 dark:bg-blue-800/50 dark:text-blue-300 cursor-not-allowed animate-pulse"
    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:scale-105 active:scale-95 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={`${baseClasses} ${colorClasses} ${sizeClasses[size]} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1`}
            disabled={wasClicked || isLoading}
            tabIndex={0}
          >
            <span
              className={
                wasClicked || isLoading
                  ? "opacity-0 transition-opacity duration-150"
                  : "opacity-100 transition-opacity duration-150"
              }
            >
              <Icon className={iconSizeClasses[size]} />
            </span>

            {isLoading && (
              <span className="absolute inset-0 flex items-center justify-center">
                <Loader2 className={`${iconSizeClasses[size]} animate-spin`} />
              </span>
            )}

            {wasClicked && (
              <span className="absolute inset-0 flex items-center justify-center">
                <Check className={`${iconSizeClasses[size]} text-green-600 dark:text-green-400`} />
              </span>
            )}
          </button>
        </TooltipTrigger>
        {title && <TooltipContent>{title}</TooltipContent>}
      </Tooltip>
    </TooltipProvider>
  );
}
