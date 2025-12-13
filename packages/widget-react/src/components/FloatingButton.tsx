import React, { forwardRef } from "react";

export interface FloatingButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
}

const positionStyles: Record<string, React.CSSProperties> = {
  "bottom-right": { bottom: 20, right: 20 },
  "bottom-left": { bottom: 20, left: 20 },
  "top-right": { top: 20, right: 20 },
  "top-left": { top: 20, left: 20 },
};

export const FloatingButton = forwardRef<HTMLButtonElement, FloatingButtonProps>(
  ({ position = "bottom-right", style, ...props }, ref) => {
    return (
      <button
        ref={ref}
        {...props}
        style={{
          position: "fixed",
          ...positionStyles[position],
          width: 56,
          height: 56,
          borderRadius: "50%",
          backgroundColor: "var(--onemcp-accent, #0066ff)",
          color: "var(--onemcp-accent-text, #ffffff)",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "var(--onemcp-shadow, 0 4px 12px rgba(0,0,0,0.15))",
          transition: "transform 0.2s, box-shadow 0.2s",
          zIndex: 999999,
          ...style,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.05)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
        }}
        aria-label="Open chat assistant"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    );
  }
);

FloatingButton.displayName = "FloatingButton";
