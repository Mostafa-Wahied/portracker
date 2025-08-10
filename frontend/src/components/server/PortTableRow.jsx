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

function PortTableRowComponent({
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

  const itemKey = `${serverId}-${port.host_ip}-${port.host_port}`;

  return (
    <tr
      tabIndex="0"
      className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 focus:outline-none focus:bg-slate-50 dark:focus:bg-slate-800/50"
    >
      <td className="px-4 py-3 text-center">
        <div className="flex justify-center">
          <PortStatusIndicator
            serverId={serverId}
            serverUrl={serverUrl}
            port={port}
            onProtocolChange={setProtocol}
          />
        </div>
      </td>
      <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
        <div className="flex flex-col space-y-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={`${protocol}://${hostForUi}:${port.host_port}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/link inline-flex items-center space-x-1 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-800/40 dark:text-indigo-200 text-sm font-semibold">
                    {shouldHighlight
                      ? renderHighlightedText(
                          highlightText(port.host_port.toString(), searchTerm)
                        )
                      : port.host_port}
                  </span>
                  <ExternalLink className="w-3 h-3 text-indigo-600 dark:text-indigo-400 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                </a>
              </TooltipTrigger>
              {!port.internal && port.target && (
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

          {/* Show internal port when search matches and it's different */}
          {searchMatches.target &&
            port.target !== port.host_port.toString() && (
              <span className="text-xs text-slate-500 dark:text-slate-400 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1 rounded border border-yellow-200 dark:border-yellow-700/50">
                Internal:{" "}
                {shouldHighlight
                  ? renderHighlightedText(
                      highlightText(port.target, searchTerm)
                    )
                  : port.target}
              </span>
            )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
        <div className="flex flex-col space-y-1">
          <span className="truncate">
            {shouldHighlight
              ? renderHighlightedText(highlightText(port.owner, searchTerm))
              : port.owner}
          </span>
          {port.note && (
            <span
              className="text-xs text-slate-400 dark:text-slate-500 italic"
              title={port.note}
            >
              {shouldHighlight
                ? renderHighlightedText(highlightText(port.note, searchTerm))
                : port.note}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
        <span
          className={`inline-block px-2 py-0.5 rounded font-medium ${
            port.source === "docker"
              ? "bg-blue-100 text-blue-800 dark:bg-blue-800/30 dark:text-blue-200"
              : "bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-200"
          }`}
        >
          {port.source}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 font-mono">
        {shouldHighlight
          ? renderHighlightedText(highlightText(hostForUi, searchTerm))
          : hostForUi}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
        {port.created ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>{formatCreatedDate(port.created)}</span>
              </TooltipTrigger>
              <TooltipContent>
                {formatCreatedTooltip(port.created).replace(/^Created: /, "")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          "N/A"
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <PortActions
            port={port}
            itemKey={itemKey}
            actionFeedback={actionFeedback}
            onCopy={() => onCopy(port, protocol)}
            onEdit={() => onNote(serverId, port)}
            onHide={() => onToggleIgnore(serverId, port)}
          />
        </div>
      </td>
    </tr>
  );
}

export const PortTableRow = React.memo(PortTableRowComponent);
