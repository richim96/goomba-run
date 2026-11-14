import Cocoa
import WebKit

// Goomba Run for macOS: one window with a web view that shows the game.
// The game is the single self-contained index.html in the app's Resources,
// so the app needs no network and no other files.
//
// `GoombaRun --selftest [--snapshot out.png]` loads the game without showing a
// window, prints what it found and exits; the build script uses it as a check.

let background = NSColor(srgbRed: 0x1b / 255.0, green: 0x14 / 255.0, blue: 0x30 / 255.0, alpha: 1)
let gameSize = NSSize(width: 960, height: 540)

/// A window that stays quiet: otherwise macOS beeps for every key the page does not use.
final class GameWindow: NSWindow {
  override func noResponder(for eventSelector: Selector) {
    if eventSelector != #selector(NSResponder.keyDown(with:)) {
      super.noResponder(for: eventSelector)
    }
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
  private var window: NSWindow!
  private var webView: WKWebView!
  private let selfTest = CommandLine.arguments.contains("--selftest")

  func applicationDidFinishLaunching(_ notification: Notification) {
    let config = WKWebViewConfiguration()
    config.mediaTypesRequiringUserActionForPlayback = []
    if #available(macOS 12.3, *) {
      config.preferences.isElementFullscreenEnabled = true
    }
    webView = WKWebView(frame: NSRect(origin: .zero, size: gameSize), configuration: config)
    webView.navigationDelegate = self
    webView.underPageBackgroundColor = background

    window = GameWindow(
      contentRect: NSRect(origin: .zero, size: gameSize),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.title = "Goomba Run"
    window.backgroundColor = background
    window.contentMinSize = NSSize(width: 640, height: 360)
    window.collectionBehavior = [.fullScreenPrimary]
    window.isReleasedWhenClosed = false
    window.contentView = webView
    window.center()
    window.setFrameAutosaveName("GoombaRun")
    buildMenu()

    guard let url = Bundle.main.url(forResource: "index", withExtension: "html"),
      let html = try? String(contentsOf: url, encoding: .utf8)
    else {
      fail("The game file is missing from the app.")
      return
    }
    // A fixed made-up address (".invalid" never resolves, nothing is fetched)
    // gives the page a stable home for its saved best score.
    webView.loadHTMLString(html, baseURL: URL(string: "https://goomba-run.invalid/"))

    if selfTest {
      DispatchQueue.main.asyncAfter(deadline: .now() + 15) {
        print("SELFTEST FAILED: the page did not finish loading")
        exit(1)
      }
      return
    }
    window.makeKeyAndOrderFront(nil)
    window.makeFirstResponder(webView)
    NSApp.activate(ignoringOtherApps: true)
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }

  // The game never navigates anywhere; anything else stays out.
  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    decisionHandler(navigationAction.navigationType == .other ? .allow : .cancel)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    guard selfTest else { return }
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { self.runSelfTest() }
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    if selfTest {
      print("SELFTEST FAILED: \(error.localizedDescription)")
      exit(1)
    }
  }

  // MARK: - menu

  private func buildMenu() {
    let main = NSMenu()

    let appItem = NSMenuItem()
    let appMenu = NSMenu()
    appMenu.addItem(
      withTitle: "About Goomba Run",
      action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
      keyEquivalent: ""
    )
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: "Hide Goomba Run", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: "Quit Goomba Run", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appItem.submenu = appMenu
    main.addItem(appItem)

    let viewItem = NSMenuItem()
    let viewMenu = NSMenu(title: "View")
    let fullScreen = viewMenu.addItem(
      withTitle: "Enter Full Screen",
      action: #selector(NSWindow.toggleFullScreen(_:)),
      keyEquivalent: "f"
    )
    fullScreen.keyEquivalentModifierMask = [.control, .command]
    viewItem.submenu = viewMenu
    main.addItem(viewItem)

    let windowItem = NSMenuItem()
    let windowMenu = NSMenu(title: "Window")
    windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
    windowMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
    windowItem.submenu = windowMenu
    main.addItem(windowItem)

    NSApp.mainMenu = main
    NSApp.windowsMenu = windowMenu
  }

  private func fail(_ message: String) {
    if selfTest {
      print("SELFTEST FAILED: \(message)")
      exit(1)
    }
    let alert = NSAlert()
    alert.messageText = "Goomba Run cannot start"
    alert.informativeText = message
    alert.runModal()
    NSApp.terminate(nil)
  }

  // MARK: - self-test

  private func runSelfTest() {
    let probe = """
      JSON.stringify({
        title: document.title,
        mode: window.__goomba ? window.__goomba.game.mode : null,
<<<<<<< HEAD
        canvas: (function () {
          // the bitmap is the 320x180 game at a whole number of real pixels per game pixel
          var c = document.getElementById('game'); if (!c) return null;
          var k = c.width / 320;
          return k >= 1 && k % 1 === 0 && c.height === 180 * k ? '320x180' : c.width + 'x' + c.height;
        })(),
=======
        canvas: (function () { var c = document.getElementById('game'); return c ? c.width + 'x' + c.height : null; })(),
>>>>>>> main
        storage: (function () {
          try { localStorage.setItem('goomba-run.selftest', 'ok'); return localStorage.getItem('goomba-run.selftest'); }
          catch (e) { return 'error: ' + e; }
        })(),
        audio: typeof (window.AudioContext || window.webkitAudioContext)
      })
      """
    webView.evaluateJavaScript(probe) { result, error in
      if let error = error {
        print("SELFTEST FAILED: \(error.localizedDescription)")
        exit(1)
      }
      let report = (result as? String) ?? "null"
      let ok = report.contains("\"mode\":\"title\"") && report.contains("\"canvas\":\"320x180\"")
      let finish = {
        print((ok ? "SELFTEST OK " : "SELFTEST FAILED ") + report)
        exit(ok ? 0 : 1)
      }
      guard let flag = CommandLine.arguments.firstIndex(of: "--snapshot"),
        CommandLine.arguments.count > flag + 1
      else {
        finish()
        return
      }
      let path = CommandLine.arguments[flag + 1]
      self.webView.takeSnapshot(with: nil) { image, _ in
        if let tiff = image?.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let png = bitmap.representation(using: .png, properties: [:])
        {
          try? png.write(to: URL(fileURLWithPath: path))
        }
        finish()
      }
    }
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(CommandLine.arguments.contains("--selftest") ? .accessory : .regular)
app.run()
