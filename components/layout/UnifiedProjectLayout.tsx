import { ReactNode } from 'react'

interface UnifiedProjectLayoutProps {
    header: ReactNode
    sidebar?: ReactNode
    children: ReactNode
    sidebarOpen?: boolean
    className?: string
}

export function UnifiedProjectLayout({
    header,
    sidebar,
    children,
    sidebarOpen = true,
    className = ''
}: UnifiedProjectLayoutProps) {
    // Common Structural Styles
    // 1. Background: Always White
    // 2. Main Padding: Adjusts based on sidebar
    // 3. Header Spacer: Standardizes the top offset

    return (
        <div className={`min-h-screen bg-white ${className}`}>
            {/* Fixed Header Container */}
            {header}

            {/* Sidebar Container */}
            {sidebar && (
                <>
                    {sidebar}
                </>
            )}

            {/* Main Content Area */}
            <main
                className={`transition-all duration-300 min-h-screen
          ${sidebarOpen && sidebar ? 'md:pl-[250px]' : ''} 
          pt-[70px] /* Standard Header Spacer (Match Header Height) */
        `}
            >
                {children}
            </main>
        </div>
    )
}
