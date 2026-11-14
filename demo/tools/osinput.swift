// Tiny macOS input helper for the demo director: moves the real mouse, right-clicks, and picks an item
// in an open context menu. macOS only allows this after you add the app that runs the demo
// (Terminal, or Claude) under System Settings → Privacy & Security → Accessibility.
import Cocoa
import ApplicationServices

func screenPoint() -> CGPoint { CGEvent(source: nil)?.location ?? .zero }

func post(_ type: CGEventType, _ p: CGPoint, _ button: CGMouseButton = .left) {
    CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: button)?.post(tap: .cghidEventTap)
}

func glide(to target: CGPoint, ms: Double = 600) {
    let start = screenPoint()
    let steps = max(10, Int(ms / 12))
    for i in 1...steps {
        let t = Double(i) / Double(steps)
        let e = t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2
        post(.mouseMoved, CGPoint(x: start.x + (target.x - start.x) * e, y: start.y + (target.y - start.y) * e))
        usleep(useconds_t(ms * 1000 / Double(steps)))
    }
}

func click(_ p: CGPoint, right: Bool = false) {
    let down: CGEventType = right ? .rightMouseDown : .leftMouseDown
    let up: CGEventType = right ? .rightMouseUp : .leftMouseUp
    post(down, p, right ? .right : .left); usleep(70_000); post(up, p, right ? .right : .left)
}

func attr(_ el: AXUIElement, _ name: String) -> AnyObject? {
    var v: AnyObject?; AXUIElementCopyAttributeValue(el, name as CFString, &v); return v
}

/// Depth-first search for a menu item whose title contains `needle`.
func findMenuItem(_ el: AXUIElement, _ needle: String, depth: Int = 0) -> AXUIElement? {
    if depth > 7 { return nil }
    if (attr(el, kAXRoleAttribute) as? String) == kAXMenuBarRole { return nil }
    if (attr(el, kAXRoleAttribute) as? String) == kAXMenuItemRole,
       let title = attr(el, kAXTitleAttribute) as? String, title.localizedCaseInsensitiveContains(needle) { return el }
    for child in (attr(el, kAXChildrenAttribute) as? [AXUIElement]) ?? [] {
        if let hit = findMenuItem(child, needle, depth: depth + 1) { return hit }
    }
    return nil
}

let args = CommandLine.arguments.dropFirst().map { $0 }
switch args.first ?? "" {
case "trusted":
    print(AXIsProcessTrusted() ? "yes" : "no")
case "pos":
    let p = screenPoint(); print("\(Int(p.x)) \(Int(p.y))")
case "move":
    glide(to: CGPoint(x: Double(args[1])!, y: Double(args[2])!), ms: Double(args.count > 3 ? args[3] : "600")!)
case "click", "rightclick":
    let p = CGPoint(x: Double(args[1])!, y: Double(args[2])!)
    glide(to: p); click(p, right: args[0] == "rightclick")
case "menuitem":
    // menuitem <pid> <text>: find the open context menu (just below the cursor), glide to the item, click it
    let needle = args[2]
    var item: AXUIElement? = nil
    let sys = AXUIElementCreateSystemWide()
    let origin = screenPoint()
    for _ in 0..<30 {
        item = findMenuItem(AXUIElementCreateApplication(pid_t(Int32(args[1])!)), needle)
        if item == nil {
            // context menus are often only reachable by position: look just below/right of the cursor
            for (dx, dy) in [(25.0, 12.0), (25.0, 30.0), (-120.0, 12.0), (25.0, -12.0)] {
                var hit: AXUIElement?
                if AXUIElementCopyElementAtPosition(sys, Float(origin.x + dx), Float(origin.y + dy), &hit) == .success, var el = hit {
                    // climb to the enclosing menu, then search it
                    for _ in 0..<4 {
                        if (attr(el, kAXRoleAttribute) as? String) == kAXMenuRole { break }
                        guard let parent = attr(el, kAXParentAttribute) else { break }
                        el = parent as! AXUIElement
                    }
                    if let found = findMenuItem(el, needle) { item = found; break }
                }
            }
        }
        if item != nil { break }
        usleep(100_000)
    }
    guard let it = item, let posV = attr(it, kAXPositionAttribute), let sizeV = attr(it, kAXSizeAttribute) else {
        print("notfound"); exit(1)
    }
    var pos = CGPoint.zero, size = CGSize.zero
    AXValueGetValue(posV as! AXValue, .cgPoint, &pos); AXValueGetValue(sizeV as! AXValue, .cgSize, &size)
    let target = CGPoint(x: pos.x + min(60, size.width / 2), y: pos.y + size.height / 2)
    glide(to: target, ms: 450); usleep(250_000); click(target)
    print("clicked")
case "dump":
    // dump <pid>: print the accessibility tree (roles and titles) — debugging aid
    func walk(_ el: AXUIElement, _ d: Int) {
        if d > 6 { return }
        let role = attr(el, kAXRoleAttribute) as? String ?? "?"
        let title = attr(el, kAXTitleAttribute) as? String ?? ""
        print(String(repeating: "  ", count: d) + role + " " + title)
        if role == kAXMenuBarRole as String { return }
        for c in (attr(el, kAXChildrenAttribute) as? [AXUIElement]) ?? [] { walk(c, d + 1) }
    }
    walk(AXUIElementCreateApplication(pid_t(Int32(args[1])!)), 0)
default:
    print("usage: osinput trusted|pos|move x y [ms]|click x y|rightclick x y|menuitem <pid> <text>")
}
