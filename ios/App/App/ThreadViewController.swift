import UIKit
import Capacitor
import AVFoundation

class ThreadViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(ThreadMenuMusicPlugin())
    }
}

@objc(ThreadMenuMusicPlugin)
public class ThreadMenuMusicPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ThreadMenuMusicPlugin"
    public let jsName = "ThreadMenuMusic"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setPlaying", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise)
    ]
    private var player: AVAudioPlayer?
    private var requested = false
    private var preparations = 0

    override public func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(pauseForBackground),
            name: UIApplication.willResignActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(resumeForForeground),
            name: UIApplication.didBecomeActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(interruption(_:)),
            name: AVAudioSession.interruptionNotification, object: nil)
    }

    @objc func setPlaying(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [self] in
            requested = call.getBool("playing") ?? false
            do {
                if requested && UIApplication.shared.applicationState == .active {
                    if player == nil {
                        guard let url = Bundle.main.url(forResource: "thread-menu", withExtension: "flac", subdirectory: "public/assets") else {
                            call.reject("Missing card music"); return
                        }
                        player = try AVAudioPlayer(contentsOf: url)
                        player?.numberOfLoops = -1
                        player?.prepareToPlay()
                        preparations += 1
                    }
                    player?.volume = Float(max(0, min(1, call.getDouble("volume") ?? 0.42)))
                    if player?.isPlaying == false { player?.play() }
                } else { player?.pause() }
                call.resolve()
            } catch { call.reject("Could not play card music", nil, error) }
        }
    }
    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [self] in
            call.resolve(["playing": player?.isPlaying ?? false,
                          "position": (player?.currentTime ?? 0) * 1000,
                          "preparations": preparations])
        }
    }
    @objc private func pauseForBackground() { player?.pause() }
    @objc private func resumeForForeground() {
        if requested && player?.isPlaying == false { player?.play() }
    }
    @objc private func interruption(_ notification: Notification) {
        guard let value = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let kind = AVAudioSession.InterruptionType(rawValue: value) else { return }
        if kind == .began { player?.pause() }
        else if let value = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt,
                AVAudioSession.InterruptionOptions(rawValue: value).contains(.shouldResume),
                UIApplication.shared.applicationState == .active { resumeForForeground() }
    }
    deinit { NotificationCenter.default.removeObserver(self); player?.stop() }
}
