import { ReactNode } from 'react'

interface UnifiedHeaderShellProps {
    children: ReactNode
    className?: string
}

export function UnifiedHeaderShell({ children, className = '' }: UnifiedHeaderShellProps) {
    // The SINGLE source of truth for the Header's visual container.
    // Gradient: blue-50 -> indigo-50 -> purple-50
    // Border: blue-200
    // Shadow: lg
    // Height/Padding: pt-4 pb-4 (Total ~68-70px)

    return (
        <div className={`
      bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 
      border-b-2 border-blue-200 
      shadow-lg 
      pl-8 pr-[42px] py-4 
      fixed top-0 left-0 right-0 z-50 
      ${className}
    `}>
            <div className="flex items-center justify-between relative h-9">
                {children}
            </div>
        </div>
    )
}
