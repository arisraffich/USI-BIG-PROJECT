'use client'

import React, { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UnifiedHeaderShell } from '@/components/layout/UnifiedHeaderShell'

export interface TabItem {
    id: string
    label: string
    icon?: React.ReactNode
    count?: number
    disabled?: boolean
    onClick: () => void
}

interface SharedProjectHeaderProps {
    // Content
    projectTitle: string
    authorName: string // e.g., "John Doe's Project"
    currentTabId: string

    // Navigation
    tabs: TabItem[]

    // Slots
    centerContent?: ReactNode // Content to display in the absolute center (Desktop only)
    actions?: ReactNode   // Right side buttons (Save, Send, etc.)
    statusTag?: ReactNode // Status badge

    // Configuration
    dashboardLink?: {
        label: string
        href: string
        icon: React.ReactNode
        onClick?: () => void
    }
}

export function SharedProjectHeader({
    projectTitle,
    authorName,
    currentTabId,
    tabs,
    centerContent,
    actions,
    statusTag,
    dashboardLink
}: SharedProjectHeaderProps) {

    const activeTabLabel = tabs.find(t => t.id === currentTabId)?.label || 'Menu'

    return (
        <UnifiedHeaderShell>
            <div className="flex items-center justify-between w-full h-full">

                {/* ------------------------------------------------------------- */}
                {/* LEFT SECTION                                                  */}
                {/* Mobile: Hamburger + Current Section Title                     */}
                {/* Desktop: Hamburger + Title/Author                             */}
                {/* ------------------------------------------------------------- */}
                <div className="flex items-center gap-4">

                    {/* HAMBURGER MENU (Visible on Mobile) */}
                    {/* Note: User requested "all pages inside it", implying main nav structure. */}
                    {/* We show this on Mobile mainly, but can be useful on Desktop too if we want a "File" menu. */}
                    {/* For now, let's keep it Mobile-focused/Unified. */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="flex items-center gap-2 -ml-2 px-2 text-slate-900 hover:bg-slate-100/50">
                                <Menu className="w-5 h-5 text-slate-600" />
                                <span className="font-bold text-lg">{activeTabLabel}</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-[220px]">
                            {/* Optional Dashboard Link (Admin) */}
                            {dashboardLink && (
                                <>
                                    <DropdownMenuItem onClick={dashboardLink.onClick}>
                                        {dashboardLink.icon}
                                        <span className="ml-2">{dashboardLink.label}</span>
                                    </DropdownMenuItem>
                                    <div className="h-px bg-slate-100 my-1" />
                                </>
                            )}

                            {/* Tabs */}
                            {tabs.map((tab) => (
                                <DropdownMenuItem
                                    key={tab.id}
                                    onClick={tab.onClick}
                                    disabled={tab.disabled}
                                    className={cn(
                                        "flex items-center cursor-pointer",
                                        currentTabId === tab.id ? "bg-slate-50 font-semibold" : ""
                                    )}
                                >
                                    {tab.icon && <span className="mr-2 text-slate-500">{tab.icon}</span>}
                                    <span>{tab.label}</span>
                                    {tab.count !== undefined && tab.count > 0 && (
                                        <span className="ml-auto text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                                            {tab.count}
                                        </span>
                                    )}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* DESKTOP TITLE INFO */}
                    {/* Hidden on Mobile as per request/design to save space */}
                    <div className="hidden md:flex items-center gap-4">
                        {/* Separator */}
                        <div className="h-8 w-px bg-slate-200" />


                        <div className="flex flex-col justify-center h-full">
                            <h1 className="text-sm font-bold text-slate-900 leading-none">
                                {authorName}
                            </h1>
                        </div>

                        {/* Separator */}
                        <div className="h-8 w-px bg-slate-200" />
                    </div>

                </div>


                {/* ------------------------------------------------------------- */}
                {/* CENTER SECTION (Desktop Only)                                 */}
                {/* Custom Content (e.g. Approve Button)                          */}
                {/* ------------------------------------------------------------- */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    {centerContent}
                </div>



                {/* ------------------------------------------------------------- */}
                {/* RIGHT SECTION                                                */}
                {/* Actions & Status                                             */}
                {/* ------------------------------------------------------------- */}
                <div className="flex items-center gap-2 md:gap-4">
                    {statusTag && (
                        <div className="hidden md:block">
                            {statusTag}
                        </div>
                    )}
                    {actions}
                </div>

            </div>
        </UnifiedHeaderShell>
    )
}
