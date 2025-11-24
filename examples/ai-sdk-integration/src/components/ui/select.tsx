import * as React from "react";
import { cn } from "../../lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
	({ className, ...props }, ref) => {
		return (
			<select
				className={cn(
					"flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none cursor-pointer",
					className
				)}
				ref={ref}
				{...props}
			/>
		);
	}
);

Select.displayName = "Select";

export { Select };






