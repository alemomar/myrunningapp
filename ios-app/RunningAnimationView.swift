import SwiftUI

private struct Obstacle: Identifiable {
    let id = UUID()
    var x: CGFloat
    let symbol: String
}

// Petit décor animé, purement visuel : un coureur qui saute des obstacles
// apparaissant à intervalles aléatoires.
struct RunningAnimationView: View {
    @State private var obstacles: [Obstacle] = []
    @State private var isJumping = false
    private let laneHeight: CGFloat = 64
    private let obstacleSymbols = ["triangle.fill", "circle.fill", "square.fill"]

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottomLeading) {
                Rectangle()
                    .fill(Color.secondary.opacity(0.15))
                    .frame(height: 1)
                    .position(x: geo.size.width / 2, y: laneHeight - 8)

                ForEach(obstacles) { obstacle in
                    Image(systemName: obstacle.symbol)
                        .font(.system(size: 13))
                        .foregroundStyle(.orange)
                        .position(x: obstacle.x, y: laneHeight - 15)
                }

                Image(systemName: "figure.run")
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(.green)
                    .position(x: 26, y: laneHeight - 15 + (isJumping ? -14 : 0))
                    .animation(.easeOut(duration: 0.25), value: isJumping)
            }
            .task { await runLoop(width: geo.size.width) }
        }
        .frame(height: laneHeight)
        .clipped()
    }

    private func runLoop(width: CGFloat) async {
        async let a: () = spawnLoop(width: width)
        async let b: () = movementLoop()
        async let c: () = jumpLoop()
        _ = await (a, b, c)
    }

    private func spawnLoop(width: CGFloat) async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(Double.random(in: 1.0...2.6)))
            obstacles.append(Obstacle(x: width + 20, symbol: obstacleSymbols.randomElement()!))
        }
    }

    private func movementLoop() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(1.0 / 30.0))
            for i in obstacles.indices { obstacles[i].x -= 3 }
            obstacles.removeAll { $0.x < -20 }
        }
    }

    private func jumpLoop() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(Double.random(in: 0.8...1.7)))
            isJumping = true
            try? await Task.sleep(for: .seconds(0.25))
            isJumping = false
        }
    }
}
