import { CheckSquare, Square } from "lucide-react";
import { ActionButton } from "./ActionButton";

/**
 * Selection action button that integrates with existing action button pattern
 * Shows different icons based on selection state
 */
export function SelectionActionButton({
  port,
  serverId,
  itemKey,
  actionFeedback,
  selectionMode,
  isSelected,
  onToggleSelection,
  size = "sm"
}) {
  const handleClick = () => {
    onToggleSelection?.(port, serverId);
  };

  const getIcon = () => {
    if (selectionMode) {
      return isSelected ? CheckSquare : Square;
    }
    return CheckSquare;
  };

  const getTitle = () => {
    if (selectionMode) {
      return isSelected ? "Deselect port" : "Select port";
    }
    return "Select port";
  };

  return (
    <ActionButton
      type="select"
      itemKey={itemKey}
      actionFeedback={actionFeedback}
      onClick={handleClick}
      icon={getIcon()}
      title={getTitle()}
      size={size}
    />
  );
}