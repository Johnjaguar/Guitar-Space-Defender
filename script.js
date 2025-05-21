document.addEventListener("DOMContentLoaded", () => {
    // Initialize Lucide icons
    lucide.createIcons();

    // DOM Elements
    const elements = {
        button: document.getElementById('startButton'),
        status: document.getElementById('status'),
        currentNote: document.getElementById('currentNote'),
        frequency: document.getElementById('frequency'),
        volumeLevel: document.getElementById('volumeLevel'),
        missionStatus: document.getElementById('missionStatus'),
        missionTimer: document.getElementById('mission-timer'),
        tuningSelect: document.getElementById('tuningSelect'),
        scoreDisplay: document.getElementById('scoreDisplay'),
        livesDisplay: document.getElementById('livesDisplay'),
        gameCanvas: document.getElementById('gameCanvas'),
        gameControls: document.querySelector('.game-controls'),
        canvasContainer: document.querySelector('.canvas-container')
    };

    // Game state
    const gameState = {
        isRunning: false,
        score: 0,
        lives: 3,
        level: 1,
        currentLevel: 1, // New: Current level in progression system
        levelGoal: 5000, // New: Points needed for current level
        availableStrings: [], // New: Strings available in current level
        gameCompleted: false, // New: Track if game is completed
        moonLanding: { // New: Moon landing animation state
            active: false,
            progress: 0,
            stars: []
        },
        meteors: [],
        lastMeteorTime: 0,
        meteorInterval: 3000,
        currentNote: null,
        lastNote: null,
        lastNoteTime: 0,
        rocketPosition: 100,
        rocketY: 0,
        backgroundStars: [],
        meteorSpeed: 2,
        laserBeams: [],
        shields: [],
        maxShields: 3,
        shieldParticles: [],
        gameOverMode: false,
        canRestartWithG: false,
        restartTimerId: null
    };

    // Tunings definition
    const tunings = {
        standard: {
            name: "Standard E (EADGBE)",
            frequencies: {
                "E2": 82.41,
                "A2": 110.00,
                "D3": 146.83,
                "G3": 196.00,
                "B3": 246.94,
                "E4": 329.63
            }
        },
        "half-step": {
            name: "Half Step Down",
            frequencies: {
                "Eb2": 77.78,
                "Ab2": 103.83,
                "Db3": 138.59,
                "Gb3": 185.00,
                "Bb3": 233.08,
                "Eb4": 311.13
            }
        },
        dropD: {
            name: "Drop D",
            frequencies: {
                "D2": 73.42,
                "A2": 110.00,
                "D3": 146.83,
                "G3": 196.00,
                "B3": 246.94,
                "E4": 329.63
            }
        }
    };

    // Initialize tuning state
    let currentTuning = "standard";
    let stringFrequencies = tunings[currentTuning].frequencies;
    
    // String to display name mapping
    const stringDisplayNames = {
        "E2": "E (low)",
        "A2": "A",
        "D3": "D",
        "G3": "G",
        "B3": "B",
        "E4": "e (high)"
    };

    // Audio Context and Analyzer
    let audioContext = null;
    let analyser = null;
    let source = null;

    // Constants for audio processing
    const CONSTANTS = {
        SAMPLE_RATE: 44100,
        FFT_SIZE: 2048,
        MIN_FREQUENCY: 40,
        MAX_FREQUENCY: 2500,
        SMOOTHING_WINDOW_SIZE: 5,
        MIN_AMPLITUDE: 0.003,
        FREQUENCY_TOLERANCE: 7, // cents
        // Add new volume threshold constants
        PLUCK_VOLUME_THRESHOLD: 0.05,    // Minimum volume to count as a new pluck
        RESIDUAL_VOLUME_THRESHOLD: 0.03, // Maximum volume to consider as residual ringing
        PLUCK_COOLDOWN: 1000             // Minimum time between plucks in ms
    };

    // Smoothing window for frequency detection
    const smoothingWindow = [];

    // Get canvas and context
    const canvas = elements.gameCanvas;
    const ctx = canvas.getContext('2d');

    // Fix layout issues
    function fixLayoutIssues() {
        // Add sticky class to controls when scrolling
        const observer = new IntersectionObserver(
            ([e]) => {
                if (elements.gameControls) {
                    elements.gameControls.classList.toggle('sticky', e.intersectionRatio < 1);
                }
            },
            { threshold: [1] }
        );

        if (elements.gameControls) {
            observer.observe(elements.gameControls);
        }

        // Handle window resize
        window.addEventListener('resize', () => {
            resizeCanvas();
            requestAnimationFrame(() => {
                // Reposition game elements after resize
                if (gameState.rocketY > canvas.height) {
                    gameState.rocketY = canvas.height / 2;
                }
                // Redraw game if running
                if (gameState.isRunning) {
                    drawGame();
                }
            });
        });

        // Initial canvas resize
        resizeCanvas();
    }

    // Make sure canvas resizing works properly
    function resizeCanvas() {
        const container = elements.canvasContainer;
        if (!container || !canvas) return;

        // Get container dimensions
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        // Set canvas size based on container while maintaining 5:3 aspect ratio
        canvas.width = containerWidth;
        canvas.height = containerWidth * 0.6; // 5:3 aspect ratio

        // Update canvas style
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.objectFit = 'contain';

        // Update game state positions if needed
        if (gameState.rocketY > canvas.height) {
            gameState.rocketY = canvas.height / 2;
        }

        // Adjust meteor positions
        gameState.meteors.forEach(meteor => {
            if (meteor.y > canvas.height) {
                meteor.y = canvas.height - meteor.size;
            }
        });
    }

    // Call fixLayoutIssues during initialization
    fixLayoutIssues();

    // Initialize stars
    function initStars() {
        gameState.backgroundStars = [];
        const numStars = 100;
        for (let i = 0; i < numStars; i++) {
            gameState.backgroundStars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2 + 1,
                speed: Math.random() * 2 + 1
            });
        }
    }

    // Create a meteor with string name
    function createMeteor() {
        // Get list of available strings for the current level
        const availableStrings = gameState.availableStrings;
        if (!availableStrings || availableStrings.length === 0) return;
        
        const randomString = availableStrings[Math.floor(Math.random() * availableStrings.length)];
        
        // Define base size and assign sizes based on string thickness
        // High E (thinnest) = smallest, Low E (thickest) = largest
        let baseSize;
        
        // Set the size based on string name - correlates with actual string thickness
        switch(randomString) {
            case 'E4': // High E (thinnest)
                baseSize = 20;
                break;
            case 'B3': // B string
                baseSize = 25;
                break;
            case 'G3': // G string
                baseSize = 30;
                break;
            case 'D3': // D string
                baseSize = 35;
                break;
            case 'A2': // A string
                baseSize = 40;
                break;
            case 'E2': // Low E (thickest)
                baseSize = 45;
                break;
            // For drop-D and other tunings, fallback sizes
            case 'Eb4':
                baseSize = 20;
                break;
            case 'Bb3':
                baseSize = 25;
                break;
            case 'Gb3':
                baseSize = 30;
                break;
            case 'Db3':
                baseSize = 35;
                break;
            case 'Ab2':
                baseSize = 40;
                break;
            case 'Eb2':
                baseSize = 45;
                break;
            case 'D2': // Drop D lowest string
                baseSize = 45;
                break;
            default:
                // Default size with small variation for any unlisted strings
                baseSize = 30;
        }
        
        // Add small random variation (±15%) to prevent exact uniformity
        const sizeVariation = baseSize * 0.15;
        const finalSize = baseSize + (Math.random() * sizeVariation * 2 - sizeVariation);
        
        // Create meteor with string name and appropriate size
        const meteor = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            x: canvas.width + 50,
            y: 50 + Math.random() * (canvas.height - 100),
            size: finalSize,
            speed: gameState.meteorSpeed + Math.random() * gameState.level,
            string: randomString,
            displayName: stringDisplayNames[randomString] || randomString,
            destroyed: false,
            targeted: false,
            rotation: Math.random() * Math.PI
        };
        
        gameState.meteors.push(meteor);
    }

    // Draw the rocket with enhanced details
    function drawRocket(x, y) {
        ctx.save();
        ctx.translate(x, y);
        
        // Rocket thruster flame (if game is running)
        if (gameState.isRunning) {
            // Flame animation using time-based oscillation
            const flameSize = 30 + Math.sin(Date.now() / 100) * 10;
            
            // Outer flame glow
            const flameGradient = ctx.createRadialGradient(-40, 0, 5, -40, 0, flameSize);
            flameGradient.addColorStop(0, 'rgba(255, 165, 0, 0.9)');
            flameGradient.addColorStop(0.5, 'rgba(255, 69, 0, 0.5)');
            flameGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
            
            ctx.fillStyle = flameGradient;
            ctx.beginPath();
            ctx.arc(-40, 0, flameSize, 0, Math.PI * 2);
            ctx.fill();
            
            // Inner flame
            ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
            ctx.beginPath();
            ctx.moveTo(-40, -5);
            ctx.lineTo(-60 - Math.random() * 15, 0);
            ctx.lineTo(-40, 5);
            ctx.closePath();
            ctx.fill();
        }
        
        // Rocket body
        const bodyGradient = ctx.createLinearGradient(0, -25, 0, 25);
        bodyGradient.addColorStop(0, '#60a5fa');
        bodyGradient.addColorStop(0.5, '#3b82f6');
        bodyGradient.addColorStop(1, '#1d4ed8');
        
        ctx.fillStyle = bodyGradient;
        ctx.beginPath();
        // Main body
        ctx.moveTo(40, 0);
        ctx.lineTo(20, -15);
        ctx.lineTo(-30, -15);
        ctx.lineTo(-40, -8);
        ctx.lineTo(-40, 8);
        ctx.lineTo(-30, 15);
        ctx.lineTo(20, 15);
        ctx.closePath();
        ctx.fill();
        
        // Rocket nose cone
        const noseGradient = ctx.createLinearGradient(20, 0, 50, 0);
        noseGradient.addColorStop(0, '#3b82f6');
        noseGradient.addColorStop(1, '#60a5fa');
        
        ctx.fillStyle = noseGradient;
        ctx.beginPath();
        ctx.moveTo(20, -15);
        ctx.lineTo(50, 0);
        ctx.lineTo(20, 15);
        ctx.closePath();
        ctx.fill();
        
        // Rocket windows
        ctx.fillStyle = '#dbeafe';
        ctx.beginPath();
        ctx.arc(10, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#bfdbfe';
        ctx.beginPath();
        ctx.arc(-10, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Rocket fins
        ctx.fillStyle = '#1d4ed8';
        
        // Top fin
        ctx.beginPath();
        ctx.moveTo(-20, -15);
        ctx.lineTo(-30, -30);
        ctx.lineTo(-10, -15);
        ctx.closePath();
        ctx.fill();
        
        // Bottom fin
        ctx.beginPath();
        ctx.moveTo(-20, 15);
        ctx.lineTo(-30, 30);
        ctx.lineTo(-10, 15);
        ctx.closePath();
        ctx.fill();
        
        // Outline
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Add guitar strings as laser cannons
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.8)';
        ctx.lineWidth = 1;
        
        for (let i = 0; i < 6; i++) {
            const yPos = -10 + (i * 4);
            ctx.beginPath();
            ctx.moveTo(20, yPos);
            ctx.lineTo(40, yPos);
            ctx.stroke();
            
            // Add small cannon barrels
            ctx.fillStyle = '#94a3b8';
            ctx.beginPath();
            ctx.arc(40, yPos, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Add glow effect if powered up (after level increase)
        if (gameState.level > 1) {
            const glowOpacity = 0.3 + Math.sin(Date.now() / 500) * 0.2;
            ctx.fillStyle = `rgba(96, 165, 250, ${glowOpacity})`;
            ctx.beginPath();
            ctx.arc(10, 0, 25, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }

    // Draw a meteor with string name
    function drawMeteor(meteor) {
        ctx.save();
        ctx.translate(meteor.x, meteor.y);
        
        // Rotate only the meteor body, not the text
        ctx.rotate(meteor.rotation);
        
        // Draw meteor body with glow effect
        // Outer glow
        const gradient = ctx.createRadialGradient(0, 0, meteor.size * 0.8, 0, 0, meteor.size * 1.3);
        gradient.addColorStop(0, 'rgba(160, 82, 45, 1)');
        gradient.addColorStop(0.7, 'rgba(160, 82, 45, 0.6)');
        gradient.addColorStop(1, 'rgba(160, 82, 45, 0)');
        
        ctx.beginPath();
        ctx.arc(0, 0, meteor.size * 1.3, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Main meteor body
        ctx.fillStyle = '#a0522d';
        ctx.beginPath();
        ctx.arc(0, 0, meteor.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8b4513';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Add crater details
        ctx.fillStyle = 'rgba(139, 69, 19, 0.5)';
        const craterPositions = [
            { x: meteor.size * 0.4, y: meteor.size * -0.3, size: meteor.size * 0.2 },
            { x: meteor.size * -0.5, y: meteor.size * 0.2, size: meteor.size * 0.25 },
            { x: meteor.size * 0.1, y: meteor.size * 0.4, size: meteor.size * 0.15 }
        ];
        
        craterPositions.forEach(crater => {
            ctx.beginPath();
            ctx.arc(crater.x, crater.y, crater.size, 0, Math.PI * 2);
            ctx.fill();
        });
        
        // IMPORTANT: Reset rotation before drawing text
        ctx.restore();
        ctx.save();
        ctx.translate(meteor.x, meteor.y);
        
        // Create a background for the text that doesn't rotate
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.arc(0, 0, meteor.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw string name with glow effect - NO ROTATION
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = 'white';
        ctx.font = `bold ${Math.max(16, meteor.size / 2)}px 'Share Tech Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(meteor.displayName, 0, 0);
        
        ctx.restore();
    }

    // Draw a laser beam with improved effects
    function drawLaser(laser) {
        if (!laser || !laser.active) return;
        
        ctx.save();
        
        // Calculate how long the laser has been active
        const now = Date.now();
        const age = now - laser.timestamp;
        const lifespan = 600; // Longer lifespan for better visibility
        const lifeFactor = Math.max(0, 1 - (age / lifespan));
        
        if (lifeFactor <= 0) {
            laser.active = false;
            ctx.restore();
            return;
        }
        
        // Create a brighter gradient for better visibility
        const gradient = ctx.createLinearGradient(
            laser.startX, laser.startY, 
            laser.endX, laser.endY
        );
        
        gradient.addColorStop(0, 'rgba(96, 165, 250, 1)');
        gradient.addColorStop(0.5, 'rgba(129, 140, 248, 1)');
        gradient.addColorStop(1, 'rgba(96, 165, 250, 0.1)');
        
        // Draw main beam with increased width
        ctx.strokeStyle = gradient;
        ctx.lineWidth = Math.max(2, 5 * lifeFactor); // Thicker line for visibility
        ctx.beginPath();
        ctx.moveTo(laser.startX, laser.startY);
        ctx.lineTo(laser.endX, laser.endY);
        ctx.stroke();
        
        // Add stronger glow effect
        ctx.shadowColor = 'rgba(96, 165, 250, 0.8)';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = Math.max(1, 6 * lifeFactor);
        ctx.beginPath();
        ctx.moveTo(laser.startX, laser.startY);
        ctx.lineTo(laser.endX, laser.endY);
        ctx.stroke();
        
        // Add pulse effect along the beam
        const distance = Math.sqrt(
            Math.pow(laser.endX - laser.startX, 2) + 
            Math.pow(laser.endY - laser.startY, 2)
        );
        
        if (distance > 10) {
            const pulseCount = Math.min(5, Math.floor(distance / 50));
            const dx = (laser.endX - laser.startX) / pulseCount;
            const dy = (laser.endY - laser.startY) / pulseCount;
            
            const pulseSize = Math.max(3, 7 * lifeFactor); // Larger pulses
            
            for (let i = 0; i < pulseCount; i++) {
                const pulseX = laser.startX + (i * dx) + ((age / 50) % Math.max(1, dx));
                const pulseY = laser.startY + (i * dy) + ((age / 50) % Math.max(1, dy));
                
                // Bright core of pulse
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.beginPath();
                ctx.arc(pulseX, pulseY, pulseSize, 0, Math.PI * 2);
                ctx.fill();
                
                // Outer glow of pulse
                ctx.fillStyle = 'rgba(96, 165, 250, 0.7)';
                ctx.beginPath();
                ctx.arc(pulseX, pulseY, pulseSize * 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        ctx.restore();
    }
    
    // Modify the fireLaser function to target only one meteor per string pluck
    function fireLaser(targetString) {
        // Find the nearest meteor that matches the string and isn't already targeted
        const targetMeteor = findNearestMeteorForString(targetString);
        
        if (targetMeteor) {
            // Create a laser with a timestamp and unique ID
            const laser = {
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                startX: gameState.rocketPosition + 40,
                startY: gameState.rocketY,
                endX: targetMeteor.x,
                endY: targetMeteor.y,
                targetId: targetMeteor.id,
                timestamp: Date.now(),
                stringType: targetString,
                active: true,
                hasHit: false // Track if this laser has already hit a target
            };
            
            // Add the laser to the game state
            gameState.laserBeams.push(laser);
            
            // Play laser sound with volume based on pluck intensity
            const pluckVolume = gameState.lastNoteVolume || 0.5;
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // Scale laser sound volume with pluck volume (with limits)
            const soundVolume = Math.min(0.5, Math.max(0.1, pluckVolume * 2));
            gainNode.gain.setValueAtTime(soundVolume, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
            
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.2);
            
            // Mark this meteor as targeted to prevent other lasers from targeting it
            targetMeteor.targeted = true;
            
            // Force a longer cooldown between string detections to prevent rapid-fire
            gameState.lastNoteTime = Date.now();
            gameState.lastNote = targetString;
            
            console.log(`Laser fired at meteor ${targetMeteor.id} for string ${targetString} with volume ${pluckVolume.toFixed(3)}`);
            return true; // Indicate a laser was fired
        }
        
        return false; // No laser was fired
    }

    // Modify checkCollisions to properly handle meteor destruction
    function checkCollisions() {
        const now = Date.now();
        
        // Process each laser beam
        for (let i = gameState.laserBeams.length - 1; i >= 0; i--) {
            const laser = gameState.laserBeams[i];
            
            // Skip inactive lasers or lasers that have already hit
            if (!laser.active || laser.hasHit) {
                continue;
            }
            
            // Find the target meteor
            const targetMeteor = gameState.meteors.find(m => 
                m.id === laser.targetId && 
                !m.destroyed
            );
            
            if (targetMeteor) {
                // Check if laser has reached the meteor
                const distance = Math.sqrt(
                    Math.pow(targetMeteor.x - laser.endX, 2) + 
                    Math.pow(targetMeteor.y - laser.endY, 2)
                );
                
                // If the laser is close enough to the meteor
                if (distance < targetMeteor.size) {
                    // Mark this meteor as destroyed
                    targetMeteor.destroyed = true;
                    
                    // Mark this laser as having hit its target
                    laser.hasHit = true;
                    
                    // Calculate score based on meteor size
                    const sizeBonus = Math.max(1, 50 / targetMeteor.size);
                    const baseScore = 100 * gameState.level;
                    const totalScore = Math.floor(baseScore * sizeBonus);
                    
                    gameState.score += totalScore;
                    elements.scoreDisplay.textContent = gameState.score;
                    
                    // Create score popup at meteor location
                    createScorePopup(targetMeteor.x, targetMeteor.y, totalScore);
                    
                    // Create explosion effect
                    createExplosion(targetMeteor.x, targetMeteor.y, targetMeteor.size);
                    
                    console.log(`Meteor ${targetMeteor.id} destroyed by laser ${laser.id}`);
                }
            }
            
            // Check if laser has reached the end of its lifespan
            if (now - laser.timestamp > 600) {
                laser.active = false;
            }
        }
        
        // Clean up inactive lasers after processing
        gameState.laserBeams = gameState.laserBeams.filter(laser => laser.active);
    }

    // Update findNearestMeteorForString to be more precise
    function findNearestMeteorForString(targetString) {
        let nearestMeteor = null;
        let minDistance = Infinity;
        
        // Only consider valid, untargeted meteors of the correct string type
        const validMeteors = gameState.meteors.filter(meteor => {
            return !meteor.destroyed && 
                   !meteor.targeted && 
                   meteor.string === targetString && 
                   meteor.x > gameState.rocketPosition; // Only meteors in front of rocket
        });
        
        // Find the nearest eligible meteor
        validMeteors.forEach(meteor => {
            const distance = meteor.x - gameState.rocketPosition;
            if (distance < minDistance) {
                minDistance = distance;
                nearestMeteor = meteor;
            }
        });
        
        // Log debugging info
        if (nearestMeteor) {
            console.log(`Found nearest ${targetString} meteor: ${nearestMeteor.id} at distance ${minDistance}`);
        } else {
            console.log(`No eligible meteors found for string ${targetString}`);
        }
        
        return nearestMeteor;
    }

    // Create explosion effect with animation
    let explosions = [];
    
    function createExplosion(x, y, size) {
        explosions.push({
            x,
            y,
            size,
            particles: [],
            timestamp: Date.now(),
            duration: 1500 // 1.5 seconds
        });
        
        // Create particles
        const particleCount = Math.floor(size * 0.8);
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            const particleSize = 2 + Math.random() * 4;
            
            explosions[explosions.length - 1].particles.push({
                x: 0,
                y: 0,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: particleSize,
                color: getExplosionParticleColor(),
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.2
            });
        }
        
        // Play explosion sound
        playExplosionSound();
    }
    
    function getExplosionParticleColor() {
        const colors = [
            '#ffcc00', // yellow
            '#ff9933', // orange
            '#ff6600', // dark orange
            '#ff3300', // red-orange
            '#ff0000', // red
            '#ffff66'  // light yellow
        ];
        
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    function updateExplosions() {
        const now = Date.now();
        
        // Update each explosion
        explosions = explosions.filter(explosion => {
            // Check if explosion has expired
            if (now - explosion.timestamp > explosion.duration) {
                return false;
            }
            
            // Get explosion progress (0 to 1)
            const progress = (now - explosion.timestamp) / explosion.duration;
            
            // Update particles
            explosion.particles.forEach(particle => {
                // Move particle
                particle.x += particle.vx;
                particle.y += particle.vy;
                
                // Apply some drag
                particle.vx *= 0.98;
                particle.vy *= 0.98;
                
                // Rotate particle
                particle.rotation += particle.rotationSpeed;
            });
            
            return true;
        });
    }
    
    function drawExplosions() {
        const now = Date.now();
        
        // Draw each explosion
        explosions.forEach(explosion => {
            // Get explosion progress (0 to 1)
            const progress = (now - explosion.timestamp) / explosion.duration;
            const opacity = 1 - progress;
            
            ctx.save();
            ctx.translate(explosion.x, explosion.y);
            
            // Draw initial flash
            if (progress < 0.2) {
                const flashOpacity = 1 - (progress / 0.2);
                ctx.globalAlpha = flashOpacity;
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(0, 0, explosion.size * (1 + progress * 2), 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Draw each particle
            explosion.particles.forEach(particle => {
                ctx.save();
                ctx.globalAlpha = opacity;
                ctx.translate(particle.x, particle.y);
                ctx.rotate(particle.rotation);
                
                // Draw particle
                ctx.fillStyle = particle.color;
                const particleSize = particle.size * (1 - progress * 0.5);
                
                ctx.beginPath();
                ctx.moveTo(0, -particleSize);
                ctx.lineTo(particleSize, 0);
                ctx.lineTo(0, particleSize);
                ctx.lineTo(-particleSize, 0);
                ctx.closePath();
                ctx.fill();
                
                ctx.restore();
            });
            
            ctx.restore();
        });
    }
    
    function playExplosionSound() {
        if (!audioContext) return;
        
        // Create noise for explosion
        const bufferSize = audioContext.sampleRate / 10; // 100ms buffer
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        // Fill with noise
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        // Create source from buffer
        const noise = audioContext.createBufferSource();
        noise.buffer = buffer;
        
        // Create filters for explosion sound
        const lowpass = audioContext.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.setValueAtTime(400, audioContext.currentTime);
        lowpass.Q.setValueAtTime(10, audioContext.currentTime);
        
        // Create gain node for volume envelope
        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(0.8, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        // Connect nodes
        noise.connect(lowpass);
        lowpass.connect(gain);
        gain.connect(audioContext.destination);
        
        // Play sound
        noise.start();
        noise.stop(audioContext.currentTime + 0.5);
    }

    // Create a score popup
    const scorePopups = [];
    
    function createScorePopup(x, y, score) {
        scorePopups.push({
            x,
            y,
            score,
            timestamp: Date.now(),
            duration: 1500
        });
    }
    
    function updateScorePopups() {
        const now = Date.now();
        
        // Update each popup
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const popup = scorePopups[i];
            
            // Remove expired popups
            if (now - popup.timestamp > popup.duration) {
                scorePopups.splice(i, 1);
                continue;
            }
            
            // Move popup upward
            popup.y -= 0.5;
        }
    }
    
    function drawScorePopups() {
        const now = Date.now();
        
        // Draw each popup
        scorePopups.forEach(popup => {
            const age = now - popup.timestamp;
            const opacity = 1 - (age / popup.duration);
            const scale = 1 + (age / popup.duration) * 0.5;
            
            ctx.save();
            ctx.translate(popup.x, popup.y);
            ctx.scale(scale, scale);
            ctx.globalAlpha = opacity;
            
            // Score shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.font = 'bold 18px Orbitron, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`+${popup.score}`, 2, 2);
            
            // Score text
            ctx.fillStyle = 'rgba(255, 215, 0, 1)';
            ctx.fillText(`+${popup.score}`, 0, 0);
            
            ctx.restore();
        });
    }

    // Update game state
    function updateGame() {
        // Find the nearest meteor and move rocket
        const nearestMeteor = findNearestMeteor();
        
        // Update laser beams with proper cleanup
        const now = Date.now();
        gameState.laserBeams = gameState.laserBeams.filter(laser => {
            // Only keep lasers that were created less than 500ms ago
            return (now - laser.timestamp) < 500;
        });
        
        // Move rocket to align with the nearest meteor
        if (nearestMeteor) {
            const targetY = nearestMeteor.y;
            const moveSpeed = 2 + (gameState.level * 0.5);
            
            // Smoothly move the rocket vertically
            if (Math.abs(targetY - gameState.rocketY) > 5) {
                if (targetY > gameState.rocketY) {
                    gameState.rocketY += moveSpeed;
                } else {
                    gameState.rocketY -= moveSpeed;
                }
            }
        }
        
        // Update shield positions to follow rocket
        gameState.shields.forEach((shield, index) => {
            if (shield.active) {
                shield.x = gameState.rocketPosition + 30;
                shield.y = gameState.rocketY;
                shield.opacity = 0.6 - (index * 0.1) + Math.sin(Date.now() / 500) * 0.1;
            }
        });
        
        // Move stars
        gameState.backgroundStars.forEach(star => {
            star.x -= star.speed;
            if (star.x < 0) {
                star.x = canvas.width;
                star.y = Math.random() * canvas.height;
            }
        });
        
        // Create new meteors at intervals
        if (now - gameState.lastMeteorTime > gameState.meteorInterval) {
            createMeteor();
            gameState.lastMeteorTime = now;
            
            // Decrease interval as game progresses (making it harder)
            gameState.meteorInterval = Math.max(1000, 3000 - (gameState.level * 300));
        }
        
        // Move meteors and check for collisions
        gameState.meteors.forEach(meteor => {
            meteor.x -= meteor.speed;
            meteor.rotation += 0.01;
            
            // Check if meteor has passed the rocket without being destroyed
            if (!meteor.destroyed && meteor.x < gameState.rocketPosition) {
                // Find the first active shield to destroy
                const activeShieldIndex = gameState.shields.findIndex(s => s.active);
                
                if (activeShieldIndex >= 0) {
                    // Destroy shield and create shield break effect
                    gameState.shields[activeShieldIndex].active = false;
                    createShieldBreakEffect(
                        gameState.shields[activeShieldIndex].x,
                        gameState.shields[activeShieldIndex].y
                    );
                    
                    // Update lives count
                    gameState.lives--;
                    elements.livesDisplay.textContent = gameState.lives;
                    elements.status.textContent = `SHIELD DESTROYED! ${gameState.lives} REMAINING`;
                    
                    // Mark meteor as destroyed to prevent multiple hits
                    meteor.destroyed = true;
                    
                    // Create explosion effect
                    createExplosion(meteor.x, meteor.y, meteor.size);
                    
                    // Fix: Only end game if all shields are destroyed AND lives are 0
                    if (gameState.lives <= 0 && gameState.shields.every(s => !s.active)) {
                        createExplosion(gameState.rocketPosition, gameState.rocketY, 50);
                        stopGame("GAME OVER - OUT OF SHIELDS");
                    }
                } else {
                    // All shields are gone, but player gets one final life
                    if (gameState.lives > 0) {
                        gameState.lives--;
                        elements.livesDisplay.textContent = gameState.lives;
                        elements.status.textContent = `DIRECT HIT! FINAL LIFE REMAINING!`;
                        
                        // Mark meteor as destroyed
                        meteor.destroyed = true;
                        
                        // Create explosion effect
                        createExplosion(meteor.x, meteor.y, meteor.size);
                        
                        // Visual feedback for last life
                        const flashOverlay = document.createElement('div');
                        flashOverlay.style.position = 'absolute';
                        flashOverlay.style.top = '0';
                        flashOverlay.style.left = '0';
                        flashOverlay.style.width = '100%';
                        flashOverlay.style.height = '100%';
                        flashOverlay.style.backgroundColor = 'rgba(239, 68, 68, 0.3)';
                        flashOverlay.style.pointerEvents = 'none';
                        flashOverlay.style.zIndex = '5';
                        flashOverlay.style.animation = 'flash-danger 0.5s forwards';
                        document.body.appendChild(flashOverlay);
                        
                        // Remove flash after animation
                        setTimeout(() => {
                            if (flashOverlay.parentNode) {
                                flashOverlay.parentNode.removeChild(flashOverlay);
                            }
                        }, 500);
                        
                        // Only end game if on final life
                        if (gameState.lives <= 0) {
                            createExplosion(gameState.rocketPosition, gameState.rocketY, 50);
                            stopGame("GAME OVER - ROCKET DESTROYED");
                        }
                    } else {
                        // Game over when final life is lost
                        meteor.destroyed = true;
                        createExplosion(gameState.rocketPosition, gameState.rocketY, 50);
                        stopGame("GAME OVER - ROCKET DESTROYED");
                    }
                }
            }
        });
        
        // Update particles and other effects
        updateShieldParticles();
        updateExplosions();
        updateScorePopups();
        
        // Check for collisions between lasers and meteors
        checkCollisions();
        
        // Level up check
        if (gameState.score >= gameState.levelGoal) {
            if (gameState.currentLevel < 4) {
                // Advance to next level
                gameState.currentLevel++;
                gameState.score = 0; // Reset score for new level
                setupLevelStrings();
                elements.status.textContent = `LEVEL UP! NOW AT LEVEL ${gameState.currentLevel}: ${getLevelDescription()}`;
                playLevelUpSound();
            } else {
                // Game completed - start moon landing
                gameState.gameCompleted = true;
                initMoonLanding();
                return; // Stop normal game updates
            }
        }
    }

    // Draw the game
    function drawGame() {
        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw starfield background
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw stars
        gameState.backgroundStars.forEach(star => {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fillRect(star.x, star.y, star.size, star.size);
        });
        
        // Draw laser beams
        gameState.laserBeams.forEach(laser => {
            drawLaser(laser);
        });
        
        // Draw meteors
        gameState.meteors.forEach(meteor => {
            if (!meteor.destroyed) {
                drawMeteor(meteor);
            }
        });
        
        // Draw explosions
        drawExplosions();
        
        // Draw shield bubbles
        gameState.shields.forEach(shield => {
            if (shield.active) {
                ctx.save();
                
                // Create gradient for shield with color based on tier
                let shieldColor;
                if (shield.tier === 1) {
                    shieldColor = 'rgba(96, 165, 250, '; // Blue for outermost
                } else if (shield.tier === 2) {
                    shieldColor = 'rgba(129, 140, 248, '; // Purple for middle
                } else {
                    shieldColor = 'rgba(168, 85, 247, '; // Pink/violet for innermost
                }
                
                const gradient = ctx.createRadialGradient(
                    shield.x, shield.y, shield.radius * 0.5,
                    shield.x, shield.y, shield.radius
                );
                gradient.addColorStop(0, `${shieldColor}${shield.opacity * 0.7})`);
                gradient.addColorStop(0.8, `${shieldColor}${shield.opacity * 0.3})`);
                gradient.addColorStop(1, `${shieldColor}0)`);
                
                // Draw bubble
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(shield.x, shield.y, shield.radius, 0, Math.PI * 2);
                ctx.fill();
                
                // Add hexagonal pattern
                ctx.strokeStyle = `rgba(255, 255, 255, ${shield.opacity * 0.4})`;
                ctx.lineWidth = 1;
                
                // Draw hexagon pattern
                const points = 6;
                const angleStep = (Math.PI * 2) / points;
                
                ctx.beginPath();
                for (let i = 0; i < points; i++) {
                    const angle = i * angleStep;
                    const x = shield.x + Math.cos(angle) * shield.radius;
                    const y = shield.y + Math.sin(angle) * shield.radius;
                    
                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.closePath();
                ctx.stroke();
                
                ctx.restore();
            }
        });
        
        // Draw shield particles
        drawShieldParticles();
        
        // Draw the rocket
        drawRocket(gameState.rocketPosition, gameState.rocketY);
        
        // Draw score popups
        drawScorePopups();
        
        // Draw string helper
        drawStringHelper();

        // Draw score display on canvas
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.fillRect(10, 10, 150, 40);
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, 150, 40);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Orbitron, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`SCORE: ${gameState.score}`, 20, 30);
        ctx.restore();

        // Draw lives indicator
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.fillRect(canvas.width - 160, 10, 150, 40);
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(canvas.width - 160, 10, 150, 40);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Orbitron, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`SHIELDS: ${gameState.lives}`, canvas.width - 150, 30);
        ctx.restore();
        
        // Draw level progress
        drawLevelProgress();
    }
    
    // Draw a string helper at the bottom of the screen
    function drawStringHelper() {
        const stringNames = Object.keys(stringFrequencies);
        const boxWidth = canvas.width / stringNames.length;
        const boxHeight = 60;
        const y = canvas.height - boxHeight;
        
        ctx.save();
        ctx.globalAlpha = 0.7;
        
        // Draw each string box
        stringNames.forEach((stringName, index) => {
            const x = index * boxWidth;
            const isActive = stringName === gameState.lastNote;
            
            // Background
            ctx.fillStyle = isActive ? 'rgba(34, 197, 94, 0.6)' : 'rgba(15, 23, 42, 0.6)';
            ctx.fillRect(x, y, boxWidth, boxHeight);
            
            // Border
            ctx.strokeStyle = isActive ? 'rgba(34, 197, 94, 1)' : 'rgba(96, 165, 250, 0.5)';
            ctx.lineWidth = isActive ? 3 : 1;
            ctx.strokeRect(x, y, boxWidth, boxHeight);
            
            // String name
            ctx.fillStyle = 'white';
            ctx.font = '16px Orbitron, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(stringDisplayNames[stringName] || stringName, x + boxWidth / 2, y + 20);
            
            // Frequency
            ctx.font = '14px Orbitron, sans-serif';
            ctx.fillText(`${stringFrequencies[stringName].toFixed(1)} Hz`, x + boxWidth / 2, y + 40);
        });
        
        ctx.restore();
    }
    
    // Create shield break effect
    function createShieldBreakEffect(x, y) {
        // Create particles
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            
            const particle = {
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 2 + Math.random() * 4,
                color: 'rgba(96, 165, 250, 0.8)',
                life: 1.0
            };
            
            gameState.shieldParticles.push(particle);
        }
        
        // Play shield break sound
        if (audioContext) {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.3);
            
            gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.3);
        }
    }

    // Update shield particles
    function updateShieldParticles() {
        if (!gameState.shieldParticles) return;
        
        gameState.shieldParticles = gameState.shieldParticles.filter(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.life -= 0.02;
            return particle.life > 0;
        });
    }

    // Draw shield particles
    function drawShieldParticles() {
        if (!gameState.shieldParticles) return;
        
        ctx.save();
        gameState.shieldParticles.forEach(particle => {
            ctx.globalAlpha = particle.life;
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    // Update the game loop to include the new effects
    function gameLoop() {
        if (!gameState.isRunning) return;
        
        updateGame();
        drawGame();
        
        requestAnimationFrame(gameLoop);
    }
    
    // Activate demo mode for testing without microphone
    function activateDemoMode() {
        console.log("Activating demo mode");
        
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = CONSTANTS.FFT_SIZE;
        
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.5;
        
        // Create oscillator for demo notes with simulated volumes
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(82.41, audioContext.currentTime); // E2
        
        const demoNotes = [
            { freq: 82.41, duration: 3000, volume: 0.08 },  // E2
            { freq: 110.00, duration: 3000, volume: 0.07 }, // A2
            { freq: 146.83, duration: 3000, volume: 0.09 }, // D3
            { freq: 196.00, duration: 3000, volume: 0.06 }, // G3
            { freq: 246.94, duration: 3000, volume: 0.07 }, // B3
            { freq: 329.63, duration: 3000, volume: 0.08 }  // E4
        ];
        
        let noteIndex = 0;
        
        // Function to cycle through demo notes with simulated volume
        function playNextNote() {
            if (!gameState.isRunning && !activeTutorial) return;
            
            const note = demoNotes[noteIndex];
            oscillator.frequency.setValueAtTime(note.freq, audioContext.currentTime);
            
            // Find the note name for this frequency
            let noteName = null;
            let closestDistance = Infinity;
            for (const [name, frequency] of Object.entries(stringFrequencies)) {
                const distance = Math.abs(frequency - note.freq);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    noteName = name;
                }
            }
            
            // Set last note directly for demo mode with simulated volume
            if (noteName) {
                gameState.lastNote = noteName;
                gameState.lastNoteTime = Date.now();
                gameState.lastNoteVolume = note.volume;
                console.log(`Demo mode: Playing ${noteName} (${note.freq} Hz) at volume ${note.volume}`);
                
                // Update volume indicator
                updateVolumeIndicator(note.volume);
                
                // In demo mode, we'll automatically trigger a laser for each note
                if (gameState.isRunning) {
                    fireLaser(noteName);
                    window.showPluckIndicator?.();
                }
            }
            
            noteIndex = (noteIndex + 1) % demoNotes.length;
            setTimeout(playNextNote, note.duration);
        }
        
        oscillator.connect(gainNode);
        gainNode.connect(analyser);
        oscillator.start();
        
        // Start the demo sequence
        playNextNote();
        
        // Reset game state
        gameState.isRunning = true;
        gameState.score = 0;
        gameState.lives = 3;
        gameState.level = 1;
        gameState.meteors = [];
        gameState.lastMeteorTime = Date.now();
        gameState.meteorInterval = 3000;
        gameState.meteorSpeed = 2;
        gameState.laserBeams = [];
        
        // Update UI
        elements.scoreDisplay.textContent = gameState.score;
        elements.livesDisplay.textContent = gameState.lives;
        elements.button.textContent = "ABORT MISSION";
        elements.missionStatus.textContent = "DEMO MODE ACTIVE";
        elements.status.textContent = "DEMO MODE: STRINGS WILL AUTO-PLAY";
        
        // Initialize stars
        initStars();
        
        // Start mission timer
        missionStartTime = Date.now();
        requestAnimationFrame(updateMissionTimer);
        
        // Start game loop
        requestAnimationFrame(gameLoop);
        
        // Start frequency detection
        detectFrequency();
        
        // Play start sound
        playStartSound();
    }
    
    // Detect frequency from audio input and process it
    function detectFrequency() {
        // Always continue frequency detection regardless of game state
        requestAnimationFrame(detectFrequency);
        
        if (!analyser) {
            console.error("No analyser available for frequency detection");
            return;
        }
        
        const buffer = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buffer);
        
        // Calculate RMS (Root Mean Square) for volume
        const rms = Math.sqrt(buffer.reduce((acc, val) => acc + val * val, 0) / buffer.length);
        
        // Update volume indicator visual
        updateVolumeIndicator(rms);
        
        // Only process if actual volume detected
        if (rms > CONSTANTS.MIN_AMPLITUDE) {
            const frequency = findPitch(buffer, audioContext.sampleRate);
            
            if (frequency && !isNaN(frequency) && isFinite(frequency)) {
                // Pass the volume (rms) to processDetectedFrequency
                processDetectedFrequency(frequency, rms);
            }
        }
    }

    // Process the detected frequency
    function processDetectedFrequency(frequency, volume) {
        // Find closest note
        let closestNote = '';
        let minCents = Infinity;
        
        for (const [note, noteFreq] of Object.entries(stringFrequencies)) {
            const centsOff = 1200 * Math.log2(frequency / noteFreq);
            if (Math.abs(centsOff) < Math.abs(minCents)) {
                minCents = centsOff;
                closestNote = note;
            }
        }
        
        // Only accept if close enough to a target frequency
        if (Math.abs(minCents) < CONSTANTS.FREQUENCY_TOLERANCE) {
            // Update UI displays
            if (elements.currentNote) {
                elements.currentNote.textContent = closestNote;
            }
            if (elements.frequency) {
                elements.frequency.textContent = `${frequency.toFixed(1)} Hz (${(volume * 400).toFixed(0)}%)`;
            }
            
            // Set the current note in game state - always track this
            gameState.currentNote = stringDisplayNames[closestNote] || closestNote;
            
            // Get current time for comparison
            const now = Date.now();
            
            // TUTORIAL MODE vs GAME MODE detection logic
            if (activeTutorial) {
                // Tutorial mode - update last note without cooldown
                gameState.lastNote = closestNote;
                gameState.lastNoteTime = now;
                gameState.lastNoteVolume = volume;
                console.log(`Tutorial mode: String ${closestNote} detected, volume: ${volume.toFixed(3)}`);
            } else if (gameState.isRunning) {
                // Game mode - use volume threshold and cooldown
                const isNewPluck = volume >= CONSTANTS.PLUCK_VOLUME_THRESHOLD;
                const pastCooldown = now - gameState.lastNoteTime > CONSTANTS.PLUCK_COOLDOWN;
                const isDifferentString = closestNote !== gameState.lastNote;
                
                console.log(`String: ${closestNote}, Volume: ${volume.toFixed(3)}, Time since last: ${now - gameState.lastNoteTime}ms, ` +
                           `Is new pluck: ${isNewPluck}, Past cooldown: ${pastCooldown}, Different string: ${isDifferentString}`);
                
                if ((isNewPluck && pastCooldown) || (isNewPluck && isDifferentString)) {
                    elements.status.textContent = `STRING DETECTED: ${stringDisplayNames[closestNote] || closestNote} (Volume: ${(volume * 400).toFixed(0)}%)`;
                    
                    const laserFired = fireLaser(closestNote);
                    
                    if (laserFired) {
                        gameState.lastNote = closestNote;
                        gameState.lastNoteTime = now;
                        gameState.lastNoteVolume = volume;
                        console.log(`New pluck accepted: Laser fired at ${volume.toFixed(3)} volume`);
                        window.showPluckIndicator?.();
                    }
                } else {
                    console.log(`String detection ignored: ${isNewPluck ? "Volume sufficient" : "Volume too low"}, ` +
                               `${pastCooldown ? "Past cooldown" : "Within cooldown"}`);
                    
                    if (isNewPluck && !pastCooldown) {
                        elements.status.textContent = `PLUCK DETECTED BUT TOO SOON - WAIT A MOMENT`;
                    }
                }
            } else {
                // Not in game or tutorial mode - just update display
                elements.status.textContent = `STRING DETECTED: ${stringDisplayNames[closestNote] || closestNote}`;
            }
        }
    }

    // Find the nearest meteor for a specific string
    function findNearestMeteorForString(targetString) {
        let nearestMeteor = null;
        let minDistance = Infinity;
        
        // Only consider valid, untargeted meteors of the correct string type
        const validMeteors = gameState.meteors.filter(meteor => {
            return !meteor.destroyed && 
                   !meteor.targeted && 
                   meteor.string === targetString && 
                   meteor.x > gameState.rocketPosition; // Only meteors in front of rocket
        });
        
        // Find the nearest eligible meteor
        validMeteors.forEach(meteor => {
            const distance = meteor.x - gameState.rocketPosition;
            if (distance < minDistance) {
                minDistance = distance;
                nearestMeteor = meteor;
            }
        });
        
        // Log debugging info
        if (nearestMeteor) {
            console.log(`Found nearest ${targetString} meteor: ${nearestMeteor.id} at distance ${minDistance}`);
        } else {
            console.log(`No eligible meteors found for string ${targetString}`);
        }
        
        return nearestMeteor;
    }

    // Update the volume level indicator with more feedback
    function updateVolumeIndicator(rms) {
        if (!elements.volumeLevel) {
            console.error("Volume level element not found");
            return;
        }
        
        // Convert RMS to percentage (0-100%)
        const volumePercentage = Math.min(100, Math.max(0, rms * 400));
        
        // Update volume level display
        elements.volumeLevel.style.width = `${volumePercentage}%`;
        
        // Add visual feedback based on signal strength
        if (volumePercentage > CONSTANTS.PLUCK_VOLUME_THRESHOLD * 400) {
            elements.volumeLevel.style.backgroundColor = 'var(--success)';
        } else if (volumePercentage > CONSTANTS.RESIDUAL_VOLUME_THRESHOLD * 400) {
            elements.volumeLevel.style.backgroundColor = 'var(--warning)';
        } else {
            elements.volumeLevel.style.backgroundColor = 'var(--text-secondary)';
        }
        
        // Add threshold markers if they don't exist
        const volumeContainer = elements.volumeLevel.parentElement;
        if (volumeContainer && !volumeContainer.querySelector('.threshold-marker')) {
            addThresholdMarker(volumeContainer, CONSTANTS.PLUCK_VOLUME_THRESHOLD * 400, 'var(--success)', 'PLUCK');
            addThresholdMarker(volumeContainer, CONSTANTS.RESIDUAL_VOLUME_THRESHOLD * 400, 'var(--warning)', 'MIN');
        }
    }

    // Find the pitch in an audio buffer
    function findPitch(buffer, sampleRate) {
        const bufferSize = buffer.length;
        const correlations = new Array(bufferSize).fill(0);
        
        // Calculate autocorrelation
        for (let i = 0; i < bufferSize; i++) {
            for (let j = 0; j < bufferSize - i; j++) {
                correlations[i] += buffer[j] * buffer[j + i];
            }
        }
        
        // Normalize correlations
        const zeroCrossing = correlations[0];
        if (zeroCrossing <= 0) return null;
        
        for (let i = 1; i < bufferSize; i++) {
            correlations[i] = correlations[i] / zeroCrossing;
        }
        
        // Focus on guitar frequency range (70Hz - 350Hz)
        const minPeriod = Math.floor(sampleRate / 350);
        const maxPeriod = Math.ceil(sampleRate / 70);
        
        let bestPeriod = 0;
        let bestCorrelation = 0;
        
        for (let i = minPeriod; i < maxPeriod; i++) {
            if (correlations[i] > correlations[i-1] && 
                correlations[i] > correlations[i+1] && 
                correlations[i] > bestCorrelation) {
                
                // Check if this is a fundamental frequency, not a harmonic
                let isHarmonic = false;
                for (let factor = 2; factor <= 4; factor++) {
                    const harmonicIdx = Math.round(i / factor);
                    if (harmonicIdx >= minPeriod && 
                        correlations[harmonicIdx] > correlations[i] * 1.3) {
                        isHarmonic = true;
                        break;
                    }
                }
                
                if (!isHarmonic) {
                    bestCorrelation = correlations[i];
                    bestPeriod = i;
                }
            }
        }
        
        if (bestPeriod > 0 && bestCorrelation > 0.3) {
            const frequency = sampleRate / bestPeriod;
            return frequency >= 70 && frequency <= 350 ? frequency : null;
        }
        
        return null;
    }
    
    // Handle tuning selection change
    elements.tuningSelect.addEventListener('change', function() {
        currentTuning = this.value;
        
        if (tunings[currentTuning]) {
            console.log(`Switching to ${tunings[currentTuning].name} tuning`);
            stringFrequencies = tunings[currentTuning].frequencies;
            
            // Update string display names based on tuning
            if (currentTuning === "standard") {
                Object.assign(stringDisplayNames, {
                    "E2": "E (low)",
                    "A2": "A",
                    "D3": "D",
                    "G3": "G",
                    "B3": "B",
                    "E4": "e (high)"
                });
            } else if (currentTuning === "half-step") {
                Object.assign(stringDisplayNames, {
                    "Eb2": "Eb (low)",
                    "Ab2": "Ab",
                    "Db3": "Db",
                    "Gb3": "Gb",
                    "Bb3": "Bb",
                    "Eb4": "eb (high)"
                });
            } else if (currentTuning === "dropD") {
                Object.assign(stringDisplayNames, {
                    "D2": "D (low)",
                    "A2": "A",
                    "D3": "D",
                    "G3": "G",
                    "B3": "B",
                    "E4": "e (high)"
                });
            }
            
            elements.status.textContent = `TUNING SWITCHED TO ${tunings[currentTuning].name.toUpperCase()}`;
        } else {
            console.error('Tuning not defined:', currentTuning);
        }
    });
    
    // Add keyboard controls for testing (for developers)
    document.addEventListener('keydown', (event) => {
        // For testing restart with key 'r'
        if (event.key === 'r' && gameState.gameOverMode && gameState.canRestartWithG) {
            console.log("Manual restart triggered with 'r' key");
            gameState.gameOverMode = false;
            resetGame();
            startGame();
            return;
        }
        
        if (!gameState.isRunning) return;
        
        // Map keys to string frequencies
        const keyMap = {
            '1': 'E2',  // Low E
            '2': 'A2',  // A
            '3': 'D3',  // D
            '4': 'G3',  // G
            '5': 'B3',  // B
            '6': 'E4'   // High E
        };
        
        if (keyMap[event.key]) {
            // Simulate playing this string
            gameState.currentNote = stringDisplayNames[keyMap[event.key]] || keyMap[event.key];
            gameState.lastNote = keyMap[event.key];
            fireLaser(keyMap[event.key]);
        }
    });
    
    // Add tutorial popup system for helping new players
    const tutorials = [
        {
            id: 'welcome',
            title: 'WELCOME GUITAR CADET!',
            content: 'In this game, you\'ll learn guitar string names by destroying space meteors!',
            requiredString: 'E4', // High E string
            stringDisplayText: 'PLUCK HIGH E STRING (THINNEST) TO CONTINUE',
            nextTutorial: 'strings'
        },
        {
            id: 'strings',
            title: 'GUITAR STRING GUIDE',
            content: 'Standard guitar tuning is EADGBE, from lowest (thickest) to highest (thinnest).',
            requiredString: 'A2', // A string
            stringDisplayText: 'PLUCK A STRING TO CONTINUE',
            nextTutorial: 'gameplay'
        },
        {
            id: 'gameplay',
            title: 'MISSION OBJECTIVES',
            content: 'Pluck the string shown on each meteor to destroy it. After 3 hits, the mission fails!',
            requiredString: 'D3', // D string
            stringDisplayText: 'PLUCK D STRING TO CONTINUE',
            nextTutorial: 'final'
        },
        {
            id: 'final',
            title: 'READY FOR LAUNCH',
            content: 'Your training is complete! Ready to defend the galaxy with your guitar?',
            requiredString: 'E2', // Low E string
            stringDisplayText: 'PLUCK LOW E STRING (THICKEST) TO START MISSION',
            nextTutorial: null
        }
    ];
    
    // Track active tutorials
    let activeTutorial = null;

    // Show tutorial with string requirement
    function showTutorial(tutorial) {
        console.log(`Showing tutorial: ${tutorial.id}`);
        
        // Reset previous detection state
        gameState.lastNoteTime = 0;
        gameState.lastNote = null;
        
        // Set as active tutorial
        activeTutorial = tutorial;
        
        // Create tutorial element
        const tutorialElement = document.createElement('div');
        tutorialElement.className = 'tutorial-popup';
        tutorialElement.innerHTML = `
            <h3>${tutorial.title}</h3>
            <p>${tutorial.content}</p>
            <div class="string-instruction">${tutorial.stringDisplayText}</div>
            <div class="string-detection-indicator">LISTENING FOR STRING...</div>
        `;
        
        // Add to page
        document.body.appendChild(tutorialElement);
        
        // Make sure audio context is active
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log("Audio context resumed for tutorial");
            }).catch(err => {
                console.error("Failed to resume audio context:", err);
            });
        }
        
        // Ensure tutorial is visible
        setTimeout(() => {
            if (tutorialElement) {
                tutorialElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'center'
                });
            }
        }, 100);
        
        // Log current detection status
        console.log("Current detection state:", {
            activeTutorial: tutorial.id,
            requiredString: tutorial.requiredString,
            lastDetectedNote: gameState.lastNote,
            lastDetectionTime: gameState.lastNoteTime
        });
        
        // Set up string detection for tutorial
        const stringDetector = setInterval(() => {
            // Get current time for comparison
            const now = Date.now();
            
            // Debug log periodically
            if (now % 3000 < 100) {
                console.log("Waiting for string:", tutorial.requiredString, 
                           "Last detected:", gameState.lastNote, 
                           "Time since detection:", now - gameState.lastNoteTime);
            }
            
            // SPECIAL TUTORIAL CHECK: Use a different detection method for tutorials
            if (gameState.lastNote === tutorial.requiredString) {
                console.log(`Successfully detected required string: ${tutorial.requiredString}`);
                
                // Clear detection interval
                clearInterval(stringDetector);
                
                // Remove tutorial element
                if (tutorialElement.parentNode) {
                    document.body.removeChild(tutorialElement);
                }
                
                // Reset active tutorial BEFORE proceeding to avoid race conditions
                const nextTutorialId = tutorial.nextTutorial;
                activeTutorial = null;
                
                // Use setTimeout to ensure clean state transition
                setTimeout(() => {
                    if (nextTutorialId) {
                        console.log(`Tutorial ${tutorial.id} completed - showing next tutorial: ${nextTutorialId}`);
                        const nextTutorial = tutorials.find(t => t.id === nextTutorialId);
                        if (nextTutorial) {
                            showTutorial(nextTutorial);
                        } else {
                            console.error(`Next tutorial ${nextTutorialId} not found!`);
                            startGame();
                        }
                    } else if (tutorial.id === 'final') {
                        console.log("Final tutorial completed - starting game");
                        startGame();
                    }
                }, 300);
            }
        }, 100);
        
        // Add safety timeout and emergency button
        setTimeout(() => {
            if (activeTutorial === tutorial) {
                console.log("Tutorial may be stuck - checking audio system");
                
                if (!source || !analyser) {
                    console.log("Audio system disconnected - attempting to reconnect");
                    initAudioContext();
                }
                
                if (!tutorialElement.querySelector('.emergency-button')) {
                    const emergencyButton = document.createElement('button');
                    emergencyButton.className = 'emergency-button';
                    emergencyButton.textContent = 'SKIP TUTORIAL';
                    emergencyButton.style.marginTop = '15px';
                    emergencyButton.style.padding = '10px 20px';
                    emergencyButton.style.backgroundColor = 'var(--warning)';
                    emergencyButton.style.border = 'none';
                    emergencyButton.style.borderRadius = '5px';
                    emergencyButton.style.cursor = 'pointer';
                    emergencyButton.style.fontWeight = 'bold';
                    emergencyButton.style.fontSize = '16px';
                    
                    emergencyButton.onclick = () => {
                        console.log("Emergency escape - skipping tutorial");
                        clearInterval(stringDetector);
                        if (tutorialElement.parentNode) {
                            document.body.removeChild(tutorialElement);
                        }
                        activeTutorial = null;
                        startGame();
                    };
                    
                    tutorialElement.appendChild(emergencyButton);
                    console.log("Emergency escape button added");
                }
            }
        }, 10000);
    }
    
    // Add a function to handle game reset and restart
    function resetGame() {
        gameState.score = 0;
        gameState.lives = 3;
        gameState.level = 1;
        gameState.meteors = [];
        gameState.laserBeams = [];
        elements.scoreDisplay.textContent = "0";
        elements.livesDisplay.textContent = "3";
        gameState.gameOverMode = false;
        gameState.canRestartWithG = false;
        clearTimeout(gameState.restartTimerId);
        
        // Reset level system
        gameState.currentLevel = 1;
        gameState.gameCompleted = false;
        gameState.levelGoal = 5000;
        gameState.availableStrings = [];
    }

    // Wait for the low E string to be plucked to start the game
    function waitForStringToStartGame() {
        // Make sure audio context is initialized
        if (!audioContext) {
            initAudioContext();
        }

        // Set up interval to check if E2 is plucked
        const startGameDetector = setInterval(() => {
            if (gameState.lastNote === 'E2') {
                clearInterval(startGameDetector);
                startGame();
            }
        }, 100);
    }

    // Initialize audio context
    function initAudioContext() {
        console.log("Initializing audio context...");
        
        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                console.log("Created new audio context:", audioContext.state);
            } else if (audioContext.state === 'suspended') {
                audioContext.resume().then(() => {
                    console.log("Resumed existing audio context");
                });
            }
            
            navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                console.log("Microphone access granted");
                
                if (!analyser) {
                    analyser = audioContext.createAnalyser();
                    analyser.fftSize = CONSTANTS.FFT_SIZE;
                    console.log("Created new analyzer");
                }
                
                if (source) {
                    source.disconnect();
                    console.log("Disconnected old source");
                }
                
                source = audioContext.createMediaStreamSource(stream);
                source.connect(analyser);
                console.log("Connected new source to analyzer");
                
                detectFrequency();
                elements.status.textContent = "AUDIO SYSTEM READY";
            })
            .catch(err => {
                console.error("Microphone access denied:", err);
                elements.status.textContent = "ERROR: MICROPHONE ACCESS DENIED - CHECK BROWSER PERMISSIONS";
                elements.button.disabled = false;
                
                // Add demo mode button
                const demoButton = document.createElement('button');
                demoButton.innerText = "TRY DEMO MODE (NO MIC)";
                demoButton.style.marginTop = "10px";
                demoButton.style.padding = "10px";
                demoButton.style.backgroundColor = "#fbbf24";
                demoButton.style.color = "black";
                demoButton.style.border = "none";
                demoButton.style.borderRadius = "5px";
                demoButton.style.cursor = "pointer";
                demoButton.onclick = activateDemoMode;
                
                elements.button.parentNode.insertBefore(demoButton, elements.button.nextSibling);
            });
        } catch (e) {
            console.error("Failed to initialize audio:", e);
            elements.status.textContent = "ERROR: FAILED TO INITIALIZE AUDIO SYSTEM";
            elements.button.disabled = false;
        }
    }

    // Display welcome message
    elements.status.textContent = "WELCOME TO GUITAR SPACE DEFENDER! PLUCK LOW E STRING TO BEGIN";

    // Remove the tutorial button event listener since we're using string detection now
    const tutorialButton = document.getElementById('tutorialButton');
    if (tutorialButton) {
        tutorialButton.remove();
    }

    // Handle window resize
    window.addEventListener('resize', () => {
        resizeCanvas();
        
        // Adjust meteor positions if needed
        gameState.meteors.forEach(meteor => {
            if (meteor.y > canvas.height) {
                meteor.y = canvas.height - meteor.size;
            }
        });
    });

    // Find the nearest meteor
    function findNearestMeteor() {
        let nearestMeteor = null;
        let minDistance = Infinity;
        
        gameState.meteors.forEach(meteor => {
            if (!meteor.destroyed) {
                // Calculate distance using x position (since we only care about horizontal alignment)
                const distance = meteor.x - gameState.rocketPosition;
                
                if (distance > 0 && distance < minDistance) {
                    minDistance = distance;
                    nearestMeteor = meteor;
                }
            }
        });
        
        return nearestMeteor;
    }

    // Initialize the game
    elements.button.addEventListener('click', function() {
        if (gameState.isRunning) {
            stopGame();
        } else {
            // Initialize audio context
            initAudioContext();
            
            // Disable button while waiting for tutorials
            elements.button.disabled = true;
            elements.button.textContent = "TUTORIAL IN PROGRESS";
            elements.button.textContent = "FOLLOW TUTORIAL INSTRUCTIONS";
            
            // Show first tutorial immediately
            setTimeout(() => {
                const welcomeTutorial = tutorials.find(t => t.id === 'welcome');
                if (welcomeTutorial) {
                    showTutorial(welcomeTutorial);
                }
            }, 500);
        }
    });

    // Mission timer variables
    let missionStartTime = 0;

    // Update mission timer display
    function updateMissionTimer() {
        if (!gameState.isRunning) return;
        
        const now = Date.now();
        const elapsed = now - missionStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        elements.missionTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        requestAnimationFrame(updateMissionTimer);
    }

    // Play start sound
    function playStartSound() {
        if (!audioContext) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
    }

    // Play level up sound
    function playLevelUpSound() {
        if (!audioContext) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.1);
        oscillator.frequency.exponentialRampToValueAtTime(1760, audioContext.currentTime + 0.2);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
    }

    // Function to update game visibility state
    function updateGameVisibility() {
        if (gameState.isRunning) {
            document.body.classList.add('game-running');
        } else {
            document.body.classList.remove('game-running');
        }
    }

    // Start the game
    function startGame() {
        // Initialize game state
        gameState.isRunning = true;
        gameState.score = 0;
        gameState.lives = 3;
        gameState.level = 1;
        gameState.meteors = [];
        gameState.lastMeteorTime = Date.now();
        gameState.meteorInterval = 3000;
        gameState.meteorSpeed = 2;
        gameState.laserBeams = [];
        
        // Set initial rocket position
        const canvas = elements.gameCanvas;
        gameState.rocketPosition = canvas.width * 0.1; // 10% from left
        gameState.rocketY = canvas.height / 2;
        
        // Initialize shield bubbles with tiered system
        gameState.shields = [];
        for (let i = 0; i < gameState.maxShields; i++) {
            // Calculate decreasing shield sizes
            const scaleFactor = 1 - (i * 0.2); // First shield largest, third smallest
            gameState.shields.push({
                active: true,
                x: gameState.rocketPosition + 30, // All shields centered at same x position
                y: gameState.rocketY, // All shields centered at same y position
                radius: 45 * scaleFactor, // Larger base size with scaling
                opacity: 0.6 - (i * 0.1), // Slightly different opacity for visual layering
                tier: i + 1 // Track shield tier but don't display number
            });
        }
        
        // Update UI
        elements.scoreDisplay.textContent = gameState.score;
        elements.livesDisplay.textContent = gameState.lives;
        elements.button.textContent = "ABORT MISSION";
        elements.missionStatus.textContent = "MISSION ACTIVE";
        elements.status.textContent = "DEFEND AGAINST METEORS!";
        
        // Initialize stars
        initStars();
        
        // Start mission timer
        missionStartTime = Date.now();
        requestAnimationFrame(updateMissionTimer);
        
        // Start game loop
        requestAnimationFrame(gameLoop);
        
        // Play start sound
        playStartSound();
        
        // Force the layout to center properly and scroll to it
        setTimeout(() => {
            if (elements.canvasContainer) {
                // Ensure canvas is properly sized
                resizeCanvas();
                
                // Scroll to the canvas with smooth animation
                elements.canvasContainer.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'center'
                });
            }
        }, 500);
        
        // Initialize level system
        gameState.currentLevel = 1;
        gameState.gameCompleted = false;
        setupLevelStrings();
    }

    // Stop the game with better audio handling
    function stopGame(message = "MISSION ABORTED") {
        console.log("Stopping game with message:", message);
        gameState.isRunning = false;
        
        // Update game visibility
        updateGameVisibility();
        
        // Always ensure audio remains connected and active
        if (audioContext && audioContext.state === 'suspended') {
            console.log("Resuming audio context");
            audioContext.resume();
        }
        
        // Update UI
        elements.button.textContent = "START MISSION";
        elements.missionStatus.textContent = "MISSION STANDBY";
        elements.status.textContent = message;
        
        // For game over specifically
        if (message.includes("GAME OVER")) {
            console.log("Game over detected, setting up restart with G string");
            
            // Set game over mode
            gameState.gameOverMode = true;
            gameState.canRestartWithG = false;
            
            // Clear any previous restart timer
            if (gameState.restartTimerId) {
                clearTimeout(gameState.restartTimerId);
            }
            
            // After a delay, enable restart with G
            gameState.restartTimerId = setTimeout(() => {
                console.log("Now allowing restart with G string");
                gameState.canRestartWithG = true;
                
                // Update status to make it clear
                elements.status.textContent = "GAME OVER - PLUCK G STRING TO RESTART";
                elements.status.style.color = "var(--warning)";
                elements.status.style.fontWeight = "bold";
                
                // Make sure status is visible
                elements.status.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
                
                // Keep rendering the game scene
                continueRenderingAfterGameOver();
            }, 2000);
        }
    }

    // Add this new function to keep rendering after game over
    function continueRenderingAfterGameOver() {
        if (!gameState.isRunning && gameState.gameOverMode) {
            // Keep rendering the game scene
            drawGame();
            requestAnimationFrame(continueRenderingAfterGameOver);
        }
    }

    // Simplified check tutorials function (to fix reference error)
    function checkTutorials() {
        if (!gameState.isRunning) return;
        
        // Only check for game over condition
        if (elements.status.textContent.includes("GAME OVER") && !activeTutorial) {
            const gameOverTutorial = tutorials.find(t => t.id === 'final');
            if (gameOverTutorial) {
                showTutorial(gameOverTutorial);
            }
        }
        
        // Continue checking while game is running
        if (gameState.isRunning) {
            requestAnimationFrame(checkTutorials);
        }
    }

    // This function will continuously check for G string to restart
    function setupGameOverGStringDetection() {
        // Make sure we're continuously checking for string detection
        function checkForRestart() {
            // Check if we're in game over mode and allowed to restart
            if (gameState.gameOverMode && gameState.canRestartWithG) {
                // If G string was detected recently
                if (gameState.lastNote === 'G3') {
                    const now = Date.now();
                    // Only proceed if this was a recent detection
                    if (now - gameState.lastNoteTime < 1000) {
                        console.log("G string detected - restarting game!");
                        
                        // Reset game over state
                        gameState.gameOverMode = false;
                        gameState.canRestartWithG = false;
                        
                        // Clear any pending timers
                        if (gameState.restartTimerId) {
                            clearTimeout(gameState.restartTimerId);
                            gameState.restartTimerId = null;
                        }
                        
                        // Reset and start game
                        resetGame();
                        startGame();
                        
                        // Exit this check - no need to continue
                        return;
                    }
                }
            }
            
            // Continue checking
            requestAnimationFrame(checkForRestart);
        }
        
        // Start the check loop
        checkForRestart();
    }

    // Call this function at the end of initialization
    setupGameOverGStringDetection();

    // Add keyboard shortcut to skip tutorials
    window.addEventListener('keydown', (e) => {
        // Pressing Escape key will skip all tutorials and start the game
        if (e.key === 'Escape' && activeTutorial) {
            console.log("Emergency escape triggered with Escape key");
            const tutorialElement = document.querySelector('.tutorial-popup');
            if (tutorialElement && tutorialElement.parentNode) {
                tutorialElement.parentNode.removeChild(tutorialElement);
            }
            activeTutorial = null;
            startGame();
        }
    });

    // Add automatic diagnostics when game freezes
    let lastActivityTime = Date.now();
    let activityCheckInterval = setInterval(() => {
        // If no activity for 10 seconds, print debug info
        if (Date.now() - lastActivityTime > 10000) {
            console.warn("Possible game freeze detected. Current state:");
            logGameState();
            
            // Add a message to the UI
            if (elements.status) {
                elements.status.textContent = "POSSIBLE FREEZE DETECTED - CHECK CONSOLE (F12)";
                elements.status.style.color = "var(--danger)";
            }
        }
        
        // Update activity time if game is running or tutorial active
        if (gameState.isRunning || activeTutorial) {
            lastActivityTime = Date.now();
        }
    }, 5000);

    // Function to log the current game state
    function logGameState() {
        console.log("Current Game State:", {
            isRunning: gameState.isRunning,
            score: gameState.score,
            lives: gameState.lives,
            level: gameState.level,
            meteors: gameState.meteors.length,
            lastNote: gameState.lastNote,
            lastNoteTime: gameState.lastNoteTime,
            activeTutorial: activeTutorial ? activeTutorial.id : null,
            audioContextState: audioContext ? audioContext.state : 'none',
            analyserConnected: !!analyser,
            sourceConnected: !!source
        });
    }

    // Function to force start the game (bypassing tutorials)
    function forceStartGame() {
        console.log("Force starting game...");
        
        // Clear any tutorials
        if (activeTutorial) {
            const tutorialElement = document.querySelector('.tutorial-popup');
            if (tutorialElement && tutorialElement.parentNode) {
                tutorialElement.parentNode.removeChild(tutorialElement);
            }
            activeTutorial = null;
        }
        
        // Make sure audio is initialized
        if (!audioContext) {
            initAudioContext();
        }
        
        // Reset button
        if (elements.button) {
            elements.button.disabled = false;
            elements.button.textContent = "ABORT MISSION";
        }
        
        // Start the game directly
        resetGame();
        startGame();
    }

    // Expose function to window for console debugging
    window.forceStartGame = forceStartGame;
    window.logGameState = logGameState;

    // Add new function to set up available strings for each level
    function setupLevelStrings() {
        const stringNames = Object.keys(stringFrequencies);
        
        switch(gameState.currentLevel) {
            case 1:
                // Level 1: High E and B strings only
                gameState.availableStrings = stringNames.filter(s => 
                    s === 'E4' || s === 'B3' || 
                    s === 'Eb4' || s === 'Bb3'); // Include flat tunings
                gameState.levelGoal = 5000;
                break;
            case 2:
                // Level 2: G and D strings only
                gameState.availableStrings = stringNames.filter(s => 
                    s === 'G3' || s === 'D3' || 
                    s === 'Gb3' || s === 'Db3'); // Include flat tunings
                gameState.levelGoal = 5000;
                break;
            case 3:
                // Level 3: A and Low E strings only
                gameState.availableStrings = stringNames.filter(s => 
                    s === 'A2' || s === 'E2' || s === 'D2' || 
                    s === 'Ab2' || s === 'Eb2'); // Include flat and drop D
                gameState.levelGoal = 5000;
                break;
            case 4:
                // Level 4: All strings
                gameState.availableStrings = stringNames;
                gameState.levelGoal = 10000;
                break;
            default:
                // Default - all strings
                gameState.availableStrings = stringNames;
                gameState.levelGoal = 5000;
        }
        
        // Update UI to show current level
        elements.status.textContent = `LEVEL ${gameState.currentLevel}: ${getLevelDescription()}`;
        
        console.log(`Level ${gameState.currentLevel} set up with strings:`, gameState.availableStrings);
    }

    // Helper function to get level description
    function getLevelDescription() {
        switch(gameState.currentLevel) {
            case 1: return "HIGH E & B STRINGS";
            case 2: return "G & D STRINGS";
            case 3: return "A & LOW E STRINGS";
            case 4: return "ALL STRINGS";
            default: return "CUSTOM LEVEL";
        }
    }

    // Add function to draw the level progress
    function drawLevelProgress() {
        ctx.save();
        
        // Background
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.fillRect(canvas.width / 2 - 150, 10, 300, 40);
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(canvas.width / 2 - 150, 10, 300, 40);
        
        // Level text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`LEVEL ${gameState.currentLevel}: ${gameState.score}/${gameState.levelGoal}`, canvas.width / 2, 15);
        
        // Progress bar
        const progressWidth = 280;
        const progress = Math.min(1, gameState.score / gameState.levelGoal);
        
        // Bar background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(canvas.width / 2 - 140, 30, progressWidth, 10);
        
        // Progress fill
        const gradient = ctx.createLinearGradient(
            canvas.width / 2 - 140, 0,
            canvas.width / 2 - 140 + progressWidth, 0
        );
        gradient.addColorStop(0, '#60a5fa');
        gradient.addColorStop(1, '#818cf8');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(canvas.width / 2 - 140, 30, progressWidth * progress, 10);
        
        ctx.restore();
    }

    // Add moon landing animation functions
    function initMoonLanding() {
        gameState.moonLanding.active = true;
        gameState.moonLanding.progress = 0;
        gameState.moonLanding.stars = [];
        
        // Create stars for background
        for (let i = 0; i < 100; i++) {
            gameState.moonLanding.stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2 + 1,
                speed: Math.random() * 2 + 1
            });
        }
        
        // Clear meteors
        gameState.meteors = [];
        
        // Position rocket at the top
        gameState.rocketY = 50;
        gameState.rocketPosition = canvas.width / 2;
        
        // Play completion sound
        playCompletionSound();
        
        // Start animation
        requestAnimationFrame(drawMoonLanding);
    }

    function drawMoonLanding() {
        if (!gameState.moonLanding.active) return;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw space background
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw stars
        gameState.moonLanding.stars.forEach(star => {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fillRect(star.x, star.y, star.size, star.size);
        });
        
        // Calculate progress
        gameState.moonLanding.progress += 0.005;
        const progress = Math.min(1, gameState.moonLanding.progress);
        
        // Draw moon
        const moonRadius = canvas.width * 0.3;
        const moonY = canvas.height + moonRadius - (moonRadius * 2 * progress);
        
        // Moon glow
        const moonGlow = ctx.createRadialGradient(
            canvas.width / 2, moonY, moonRadius * 0.8,
            canvas.width / 2, moonY, moonRadius * 1.2
        );
        moonGlow.addColorStop(0, 'rgba(229, 229, 229, 0.3)');
        moonGlow.addColorStop(1, 'rgba(229, 229, 229, 0)');
        
        ctx.fillStyle = moonGlow;
        ctx.beginPath();
        ctx.arc(canvas.width / 2, moonY, moonRadius * 1.2, 0, Math.PI * 2);
        ctx.fill();
        
        // Moon surface
        const moonGradient = ctx.createRadialGradient(
            canvas.width / 2, moonY, 0,
            canvas.width / 2, moonY, moonRadius
        );
        moonGradient.addColorStop(0, '#e5e5e5');
        moonGradient.addColorStop(1, '#a3a3a3');
        
        ctx.fillStyle = moonGradient;
        ctx.beginPath();
        ctx.arc(canvas.width / 2, moonY, moonRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw craters
        const craters = [
            { x: -0.2, y: -0.3, size: 0.15 },
            { x: 0.25, y: -0.15, size: 0.1 },
            { x: -0.1, y: 0.2, size: 0.2 },
            { x: 0.3, y: 0.25, size: 0.12 }
        ];
        
        craters.forEach(crater => {
            const craterX = canvas.width / 2 + moonRadius * crater.x;
            const craterY = moonY + moonRadius * crater.y;
            const craterSize = moonRadius * crater.size;
            
            ctx.fillStyle = 'rgba(100, 100, 100, 0.5)';
            ctx.beginPath();
            ctx.arc(craterX, craterY, craterSize, 0, Math.PI * 2);
            ctx.fill();
        });
        
        // Calculate rocket position
        const rocketY = canvas.height * (1 - progress) * 0.8;
        
        // Draw landing flames if close to surface
        if (progress > 0.7) {
            const flameSize = 30 * (1 - ((progress - 0.7) / 0.3));
            
            const flameGradient = ctx.createRadialGradient(
                canvas.width / 2, rocketY + 40, 5,
                canvas.width / 2, rocketY + 40, flameSize
            );
            flameGradient.addColorStop(0, 'rgba(255, 165, 0, 0.9)');
            flameGradient.addColorStop(0.5, 'rgba(255, 69, 0, 0.5)');
            flameGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
            
            ctx.fillStyle = flameGradient;
            ctx.beginPath();
            ctx.arc(canvas.width / 2, rocketY + 40, flameSize, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Draw rocket (rotated to land vertically)
        ctx.save();
        ctx.translate(canvas.width / 2, rocketY);
        ctx.rotate(Math.PI / 2);
        
        // Rocket body (simplified for landing)
        const bodyGradient = ctx.createLinearGradient(-25, 0, 25, 0);
        bodyGradient.addColorStop(0, '#60a5fa');
        bodyGradient.addColorStop(0.5, '#3b82f6');
        bodyGradient.addColorStop(1, '#1d4ed8');
        
        ctx.fillStyle = bodyGradient;
        ctx.beginPath();
        ctx.moveTo(0, -40);
        ctx.lineTo(-15, -20);
        ctx.lineTo(-15, 30);
        ctx.lineTo(-8, 40);
        ctx.lineTo(8, 40);
        ctx.lineTo(15, 30);
        ctx.lineTo(15, -20);
        ctx.closePath();
        ctx.fill();
        
        // Rocket nose cone
        const noseGradient = ctx.createLinearGradient(0, -40, 0, -60);
        noseGradient.addColorStop(0, '#3b82f6');
        noseGradient.addColorStop(1, '#60a5fa');
        
        ctx.fillStyle = noseGradient;
        ctx.beginPath();
        ctx.moveTo(-15, -20);
        ctx.lineTo(0, -60);
        ctx.lineTo(15, -20);
        ctx.closePath();
        ctx.fill();
        
        // Rocket windows
        ctx.fillStyle = '#dbeafe';
        ctx.beginPath();
        ctx.arc(0, -10, 5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#bfdbfe';
        ctx.beginPath();
        ctx.arc(0, 10, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Landing legs (extend as rocket gets closer to surface)
        if (progress > 0.5) {
            const legExtension = Math.min(1, (progress - 0.5) * 2);
            
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 3;
            
            // Left leg
            ctx.beginPath();
            ctx.moveTo(-15, 30);
            ctx.lineTo(-30 * legExtension, 40 * legExtension);
            ctx.stroke();
            
            // Right leg
            ctx.beginPath();
            ctx.moveTo(15, 30);
            ctx.lineTo(30 * legExtension, 40 * legExtension);
            ctx.stroke();
            
            // Feet
            ctx.fillStyle = '#94a3b8';
            ctx.beginPath();
            ctx.arc(-30 * legExtension, 40 * legExtension, 5, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(30 * legExtension, 40 * legExtension, 5, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
        
        // Draw completion message when landed
        if (progress >= 1) {
            ctx.save();
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.fillRect(canvas.width / 2 - 200, canvas.height / 2 - 50, 400, 100);
            
            ctx.strokeStyle = 'rgba(96, 165, 250, 0.8)';
            ctx.lineWidth = 2;
            ctx.strokeRect(canvas.width / 2 - 200, canvas.height / 2 - 50, 400, 100);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 24px Orbitron, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('MISSION COMPLETE!', canvas.width / 2, canvas.height / 2 - 20);
            ctx.font = 'bold 18px Orbitron, sans-serif';
            ctx.fillText('You have mastered all guitar strings!', canvas.width / 2, canvas.height / 2 + 20);
            
            ctx.restore();
            
            // Stop animation after landing
            setTimeout(() => {
                gameState.moonLanding.active = false;
                stopGame("MISSION COMPLETE - ALL STRINGS MASTERED!");
            }, 3000);
        } else {
            requestAnimationFrame(drawMoonLanding);
        }
    }

    // Add completion sound function
    function playCompletionSound() {
        if (!audioContext) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.2);
        oscillator.frequency.exponentialRampToValueAtTime(1760, audioContext.currentTime + 0.4);
        oscillator.frequency.exponentialRampToValueAtTime(3520, audioContext.currentTime + 0.6);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.8);
    }

    // Add emergency recovery functions
    window.fixGameFreeze = function() {
        console.log("Manual freeze recovery initiated");
        
        if (activeTutorial) {
            const tutorialElement = document.querySelector('.tutorial-popup');
            if (tutorialElement && tutorialElement.parentNode) {
                tutorialElement.parentNode.removeChild(tutorialElement);
            }
            activeTutorial = null;
        }
        
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log("Audio context resumed");
            });
        }
        
        resetGame();
        
        if (elements.button) {
            elements.button.disabled = false;
            elements.button.textContent = "START MISSION";
        }
        
        if (elements.status) {
            elements.status.textContent = "READY TO START - PRESS BUTTON";
        }
        
        return "Game state reset - press Start button to begin";
    };

    // Update keyboard shortcuts
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && activeTutorial) {
            console.log("Emergency escape triggered with Escape key");
            const tutorialElement = document.querySelector('.tutorial-popup');
            if (tutorialElement && tutorialElement.parentNode) {
                tutorialElement.parentNode.removeChild(tutorialElement);
            }
            activeTutorial = null;
            startGame();
        }
        
        if (event.key === 'r' && gameState.gameOverMode && gameState.canRestartWithG) {
            console.log("Manual restart triggered with 'r' key");
            gameState.gameOverMode = false;
            resetGame();
            startGame();
        }
        
        if (event.key === 's' && !gameState.isRunning && !activeTutorial) {
            console.log("Emergency start triggered with 's' key");
            forceStartGame();
        }
    });

    // Expose emergency functions
    window.forceStartGame = forceStartGame;
    window.fixGameFreeze = fixGameFreeze;

    console.log("Tutorial and gameplay fixes applied!");

    // Add helper function for threshold markers
    function addThresholdMarker(container, percentage, color, label) {
        const marker = document.createElement('div');
        marker.className = 'threshold-marker';
        marker.style.position = 'absolute';
        marker.style.left = `${percentage}%`;
        marker.style.top = '0';
        marker.style.bottom = '0';
        marker.style.width = '2px';
        marker.style.backgroundColor = color;
        marker.style.zIndex = '1';
        
        const markerLabel = document.createElement('div');
        markerLabel.className = 'threshold-label';
        markerLabel.textContent = label;
        markerLabel.style.position = 'absolute';
        markerLabel.style.bottom = '-20px';
        markerLabel.style.left = '50%';
        markerLabel.style.transform = 'translateX(-50%)';
        markerLabel.style.fontSize = '10px';
        markerLabel.style.color = color;
        markerLabel.style.whiteSpace = 'nowrap';
        
        marker.appendChild(markerLabel);
        container.appendChild(marker);
    }
});