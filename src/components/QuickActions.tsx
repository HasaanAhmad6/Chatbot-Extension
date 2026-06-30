type QuickActionsProps = {
  actions: string[];
  onAction: (action: string) => void;
};

export function QuickActions({ actions, onAction }: QuickActionsProps) {
  if (!actions.length) {
    return null;
  }

  return (
    <div className="chatbot-quick-actions">
      {actions.map((action) => (
        <button key={action} type="button" onClick={() => onAction(action)} className="chatbot-quick-action">
          {action}
        </button>
      ))}
    </div>
  );
}

export default QuickActions;
