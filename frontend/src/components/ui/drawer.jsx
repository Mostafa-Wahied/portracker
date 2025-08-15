import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Drawer = ({ children, ...props }) => <div {...props}>{children}</div>

const DrawerTrigger = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={className} {...props} />
))
DrawerTrigger.displayName = "DrawerTrigger"

const DrawerContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "fixed inset-y-0 right-0 z-50 h-full w-full border-l bg-background p-6 sm:max-w-sm",
      "transform translate3d(100%,0,0)",
      "data-[state=open]:animate-[slideInRight_200ms_cubic-bezier(.4,0,.2,1)_forwards]",
      "data-[state=closed]:animate-[slideOutRight_200ms_cubic-bezier(.4,0,.2,1)_forwards]",
      "motion-safe:shadow-lg motion-reduce:shadow-none",
      className
    )}
    style={{
      willChange: 'transform',
      backfaceVisibility: 'hidden',
      perspective: 1000,
      transformStyle: 'preserve-3d',
      contain: 'layout style paint'
    }}
    {...props}
  >
    {children}
  </div>
))
DrawerContent.displayName = "DrawerContent"

const DrawerOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "fixed inset-0 z-40 bg-black/50",
      "opacity-0",
      "data-[state=open]:animate-[fadeIn_200ms_ease-out_forwards]",
      "data-[state=closed]:animate-[fadeOut_200ms_ease-in_forwards]",
      className
    )}
    style={{
      willChange: 'opacity',
      backfaceVisibility: 'hidden'
    }}
    {...props}
  />
))
DrawerOverlay.displayName = "DrawerOverlay"

const DrawerHeader = ({ className, ...props }) => (
  <div
    className={cn("flex flex-col space-y-2 text-center sm:text-left", className)}
    {...props}
  />
)
DrawerHeader.displayName = "DrawerHeader"

const DrawerFooter = ({ className, ...props }) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
)
DrawerFooter.displayName = "DrawerFooter"

const DrawerTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
DrawerTitle.displayName = "DrawerTitle"

const DrawerDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DrawerDescription.displayName = "DrawerDescription"

const DrawerClose = React.forwardRef(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none",
      className
    )}
    {...props}
  >
    <X className="h-4 w-4" />
    <span className="sr-only">Close</span>
  </button>
))
DrawerClose.displayName = "DrawerClose"

export {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerOverlay,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
}