import React, { useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PortStatusIndicator } from "./PortStatusIndicator";
import { PortActions } from "./PortActions";
import {
  formatCreatedDate,
  formatCreatedTooltip,
  getSearchMatches,
  highlightText,
} from "@/lib/utils";

const renderHighlightedText = (content) => {
  if (typeof content === "string") return content;
  if (!content.isHighlighted) return content;

  return content.parts.map((part, index) =>
    part.highlighted ? (
      <mark
        key={index}
        className="bg-yellow-200 dark:bg-yellow-800/50 text-yellow-900 dark:text-yellow-200 px-0.5 rounded"
      >
        {part.text}
      </mark>
    ) : (
      <span key={index}>{part.text}</span>
    )
  );
};

/**
 * Displays detailed information and interactive actions for a network port, with optional search term highlighting.
 *
 * Renders a styled UI card showing port status, clickable port number, internal port details, owner, notes, source, creation date, and host information. Provides actions for copying, editing notes, and toggling ignore state, with dynamic highlighting of search matches.
 */
export function PortGridItem({
  port,
  serverId,
  serverUrl,
  searchTerm,
  actionFeedback,
  onCopy,
  onNote,
  onToggleIgnore,
}) {
  const [protocol, setProtocol] = useState("http");
  const searchMatches = getSearchMatches(port, searchTerm);

  const shouldHighlight = !!searchTerm;

  let hostForUi;
  if (port.host_ip === "0.0.0.0" || port.host_ip === "127.0.0.1") {
    if (serverId === "local") {
      hostForUi = window.location.hostname;
    } else if (serverUrl) {
      try {
        hostForUi = new URL(serverUrl).hostname;
      } catch {
        hostForUi = "localhost";
      }
    } else {
      hostForUi = "localhost";
    }
  } else {
    hostForUi = port.host_ip;
  }
  const uiClickableUrl = `${protocol}://${hostForUi}:${port.host_port}`;

  return (
    <div
      tabIndex="0"
      className="group relative border border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200 min-h-[120px] flex flex-col justify-between bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2 min-w-0 flex-1">
          <PortStatusIndicator
            serverId={serverId}
            serverUrl={serverUrl}
            port={port}
            onProtocolChange={setProtocol}
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={uiClickableUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/link inline-flex items-center space-x-1"
                >
                  <span className="inline-flex items-center px-2.5 py-1.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-800/40 dark:text-indigo-200 text-base font-semibold">
                    {shouldHighlight
                      ? renderHighlightedText(
                          highlightText(port.host_port.toString(), searchTerm)
                        )
                      : port.host_port}
                  </span>
                  <ExternalLink className="w-3 h-3 text-indigo-600 dark:text-indigo-400 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                </a>
              </TooltipTrigger>
              {port.target && (
                <TooltipContent>
                  {searchMatches.target ? (
                    <span>
                      Internal:{" "}
                      {shouldHighlight
                        ? renderHighlightedText(
                            highlightText(port.target, searchTerm)
                          )
                        : port.target}
                    </span>
                  ) : (
                    `Internal: ${port.target}`
                  )}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity ml-2">
          <PortActions
            port={port}
            itemKey={
              port.internal
                ? `${serverId}-${port.container_id || port.app_id}-${port.host_port}-internal`
                : `${serverId}-${port.host_ip}-${port.host_port}`
            }
            actionFeedback={actionFeedback}
            onCopy={() => onCopy(port, protocol)}
            onEdit={() => onNote(serverId, port)}
            onHide={() => onToggleIgnore(serverId, port)}
          />
        </div>
      </div>

      {/* Show internal port when search matches and it's different */}
      {searchMatches.target && port.target !== port.host_port.toString() && (
        <div className="mb-2">
          <span className="text-xs text-slate-500 dark:text-slate-400 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1 rounded border border-yellow-200 dark:border-yellow-700/50">
            Internal:{" "}
            {shouldHighlight
              ? renderHighlightedText(highlightText(port.target, searchTerm))
              : port.target}
          </span>
        </div>
      )}

      <div className="mb-2 flex-1">
        <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 break-words leading-tight">
          {shouldHighlight
            ? renderHighlightedText(highlightText(port.owner, searchTerm))
            : port.owner}
        </h4>
        {port.note && (
          <p
            className="text-xs text-slate-400 dark:text-slate-500 italic mt-1"
            title={port.note}
          >
            {shouldHighlight
              ? renderHighlightedText(highlightText(port.note, searchTerm))
              : port.note}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between text-xs gap-2">
        <span
          className={`inline-flex items-center px-2 py-1 rounded-full font-medium flex-shrink-0 ${
            port.source === "docker"
              ? "bg-blue-100 text-blue-800 dark:bg-blue-800/30 dark:text-blue-200"
              : "bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-200"
          }`}
        >
          {port.source}
        </span>
        {port.created && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-block px-2 py-1 rounded-full font-medium bg-slate-100 text-slate-500 dark:bg-slate-800/30 dark:text-slate-400 text-xs flex-shrink-0 truncate"
                  title={formatCreatedTooltip(port.created)}
                >
                  {formatCreatedDate(port.created)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {formatCreatedTooltip(port.created).replace(/^Created: /, "")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <span className="text-slate-500 dark:text-slate-400 truncate">
          {shouldHighlight
            ? renderHighlightedText(highlightText(hostForUi, searchTerm))
            : hostForUi}
        </span>
      </div>
    </div>
  );
}
