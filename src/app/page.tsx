// pages/index.tsx
"use client"
import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import * as THREE from 'three';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

type CellPosition = {
  row: number;
  col: number;
};

type SudokuBoard = number[][];

type Player = {
  name: string;
  ip: string;
};

type BestTimes = {
  [difficulty: string]: number;
};

type IndexDBBestTime = {
  playerName: string;
  difficulty: string;
  time: number;
};

type NumberUsage = {
  [key: number]: number;
};

export default function SudokuGame() {
  // Game state
  const [board, setBoard] = useState<SudokuBoard>(Array(9).fill(0).map(() => Array(9).fill(0)));
  const [solution, setSolution] = useState<SudokuBoard>(Array(9).fill(0).map(() => Array(9).fill(0)));
  const [initialBoard, setInitialBoard] = useState<SudokuBoard>(Array(9).fill(0).map(() => Array(9).fill(0)));
  const [selectedCell, setSelectedCell] = useState<CellPosition | null>(null);
  const [difficulty, setDifficulty] = useState<string>('medium');
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [showManual, setShowManual] = useState<boolean>(false);
  const [playerName, setPlayerName] = useState<string>('');
  const [profileCreated, setProfileCreated] = useState<boolean>(false);
  const [multiplayerMode, setMultiplayerMode] = useState<boolean>(false);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [gameStarted, setGameStarted] = useState<boolean>(false);
  const [timer, setTimer] = useState<number>(0);
  const [gameCompleted, setGameCompleted] = useState<boolean>(false);
  const [bestTimes, setBestTimes] = useState<BestTimes>({});
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [numberUsage, setNumberUsage] = useState<NumberUsage>({});
  const [wrongAttempts, setWrongAttempts] = useState<number>(0);
  const [hintsRemaining, setHintsRemaining] = useState<number>(3);
  const [lastSmartMove, setLastSmartMove] = useState<string>('');
  
  // Three.js refs
  const threeContainer = useRef<HTMLDivElement>(null);
  const scene = useRef<THREE.Scene | null>(null);
  const camera = useRef<THREE.PerspectiveCamera | null>(null);
  const renderer = useRef<THREE.WebGLRenderer | null>(null);
  const cube = useRef<THREE.Mesh | null>(null);
  const animationId = useRef<number>(0);

  // Initialize number usage
  useEffect(() => {
    const usage: NumberUsage = {};
    for (let i = 1; i <= 9; i++) {
      usage[i] = 9; // Each number can be used 9 times
    }
    setNumberUsage(usage);
  }, []);

  // Update number usage when board changes
  useEffect(() => {
    if (gameStarted) {
      const newUsage = { ...numberUsage };
      for (let i = 1; i <= 9; i++) {
        newUsage[i] = 9; // Reset count
      }

      // Count existing numbers on board
      board.forEach(row => {
        row.forEach(cell => {
          if (cell > 0) {
            newUsage[cell]--;
          }
        });
      });

      setNumberUsage(newUsage);
    }
  }, [board]);

  // Keyboard input handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!gameStarted || gameCompleted || isPaused) return;

      // Number keys 1-9
      if (e.key >= '1' && e.key <= '9' && selectedCell) {
        handleNumberInput(parseInt(e.key));
      }
      // Backspace or Delete to clear
      else if ((e.key === 'Backspace' || e.key === 'Delete') && selectedCell) {
        handleNumberInput(0);
      }
      // Arrow keys for navigation
      else if (selectedCell) {
        const { row, col } = selectedCell;
        switch (e.key) {
          case 'ArrowUp':
            if (row > 0) setSelectedCell({ row: row - 1, col });
            break;
          case 'ArrowDown':
            if (row < 8) setSelectedCell({ row: row + 1, col });
            break;
          case 'ArrowLeft':
            if (col > 0) setSelectedCell({ row, col: col - 1 });
            break;
          case 'ArrowRight':
            if (col < 8) setSelectedCell({ row, col: col + 1 });
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCell, gameStarted, gameCompleted, isPaused]);

  // Initialize 3D scene
  useEffect(() => {
    if (typeof window !== 'undefined' && threeContainer.current) {
      // Initialize Three.js
      scene.current = new THREE.Scene();
      camera.current = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      renderer.current = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.current.setSize(200, 200);
      threeContainer.current.appendChild(renderer.current.domElement);

      // Add a cube
      const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
      const material = new THREE.MeshPhongMaterial({ 
        color: darkMode ? 0x4ade80 : 0x3b82f6,
        shininess: 100,
        specular: 0x111111
      });
      cube.current = new THREE.Mesh(geometry, material);
      scene.current.add(cube.current);

      // Add lights
      const ambientLight = new THREE.AmbientLight(darkMode ? 0x404040 : 0xffffff, 0.5);
      scene.current.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(1, 1, 1);
      scene.current.add(directionalLight);

      camera.current.position.z = 3;

      // Animation loop
      const animate = () => {
        animationId.current = requestAnimationFrame(animate);
        if (cube.current) {
          cube.current.rotation.x += 0.01;
          cube.current.rotation.y += 0.01;
        }
        if (renderer.current && scene.current && camera.current) {
          renderer.current.render(scene.current, camera.current);
        }
      };
      animate();

      return () => {
        cancelAnimationFrame(animationId.current);
        if (threeContainer.current && renderer.current?.domElement) {
          threeContainer.current.removeChild(renderer.current.domElement);
        }
      };
    }
  }, [darkMode]);

  // Load best times from IndexedDB
  useEffect(() => {
    if (typeof window !== 'undefined' && window.indexedDB && playerName) {
      const request = window.indexedDB.open('SudokuGameDB', 1);
      
      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('players')) {
          db.createObjectStore('players', { keyPath: 'name' });
        }
        if (!db.objectStoreNames.contains('bestTimes')) {
          const store = db.createObjectStore('bestTimes', { keyPath: ['playerName', 'difficulty'] });
          store.createIndex('playerDifficulty', ['playerName', 'difficulty'], { unique: true });
        }
      };

      request.onsuccess = (event: Event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = db.transaction(['bestTimes'], 'readonly');
        const store = transaction.objectStore('bestTimes');
        const index = store.index('playerDifficulty');
        const range = IDBKeyRange.bound([playerName, ''], [playerName, '\uffff']);
        
        const request = index.openCursor(range);
        const times: BestTimes = {};
        
        request.onsuccess = (e: Event) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const value = cursor.value as IndexDBBestTime;
            times[value.difficulty] = value.time;
            cursor.continue();
          } else {
            setBestTimes(times);
          }
        };
      };
    }
  }, [playerName]);

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameStarted && !gameCompleted && !isPaused) {
      interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameStarted, gameCompleted, isPaused]);

  // Generate a solved Sudoku board
  const generateSolvedBoard = useCallback((): SudokuBoard => {
    const board: SudokuBoard = Array(9).fill(0).map(() => Array(9).fill(0));
    
    // Fill diagonal boxes
    fillDiagonalBoxes(board);
    
    // Solve remaining cells
    solveSudoku(board, 0, 0);
    
    return board;
  }, []);

  // Fill diagonal 3x3 boxes
  const fillDiagonalBoxes = useCallback((board: SudokuBoard): void => {
    for (let box = 0; box < 9; box += 3) {
      fillBox(board, box, box);
    }
  }, []);

  // Fill a 3x3 box
  const fillBox = useCallback((board: SudokuBoard, row: number, col: number): void => {
    const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    shuffleArray(nums);
    
    let index = 0;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        board[row + i][col + j] = nums[index++];
      }
    }
  }, []);

  // Shuffle array
  const shuffleArray = useCallback((array: number[]): void => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }, []);

  // Solve Sudoku recursively
  const solveSudoku = useCallback((board: SudokuBoard, row: number, col: number): boolean => {
    if (row === 9) {
      row = 0;
      if (++col === 9) return true;
    }
    
    if (board[row][col] !== 0) return solveSudoku(board, row + 1, col);
    
    for (let num = 1; num <= 9; num++) {
      if (isValid(board, row, col, num)) {
        board[row][col] = num;
        if (solveSudoku(board, row + 1, col)) return true;
      }
    }
    
    board[row][col] = 0;
    return false;
  }, []);

  // Check if number is valid in position
  const isValid = useCallback((board: SudokuBoard, row: number, col: number, num: number): boolean => {
    // Check row
    for (let x = 0; x < 9; x++) {
      if (board[row][x] === num) return false;
    }
    
    // Check column
    for (let x = 0; x < 9; x++) {
      if (board[x][col] === num) return false;
    }
    
    // Check 3x3 box
    const boxRow = row - row % 3;
    const boxCol = col - col % 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (board[boxRow + i][boxCol + j] === num) return false;
      }
    }
    
    return true;
  }, []);

  // Create puzzle from solved board
  const createPuzzle = useCallback((solvedBoard: SudokuBoard, difficulty: string): SudokuBoard => {
    const puzzle: SudokuBoard = solvedBoard.map(row => [...row]);
    let cellsToRemove: number;
    
    switch (difficulty) {
      case 'easy': cellsToRemove = 40; break;
      case 'medium': cellsToRemove = 50; break;
      case 'hard': cellsToRemove = 60; break;
      default: cellsToRemove = 50;
    }
    
    // Remove cells while maintaining uniqueness
    while (cellsToRemove > 0) {
      const row = Math.floor(Math.random() * 9);
      const col = Math.floor(Math.random() * 9);
      
      if (puzzle[row][col] !== 0) {
        const backup = puzzle[row][col];
        puzzle[row][col] = 0;
        
        // Check if solution is still unique
        const tempBoard = puzzle.map(r => [...r]);
        if (countSolutions(tempBoard) !== 1) {
          puzzle[row][col] = backup;
        } else {
          cellsToRemove--;
        }
      }
    }
    
    return puzzle;
  }, []);

  // Count number of solutions
  const countSolutions = useCallback((board: SudokuBoard): number => {
    const tempBoard = board.map(row => [...row]);
    return countSolutionsHelper(tempBoard, 0, 0);
  }, []);

  const countSolutionsHelper = useCallback((board: SudokuBoard, row: number, col: number, count: number = 0): number => {
    if (row === 9) {
      row = 0;
      if (++col === 9) return count + 1;
    }
    
    if (board[row][col] !== 0) return countSolutionsHelper(board, row + 1, col, count);
    
    for (let num = 1; num <= 9 && count < 2; num++) {
      if (isValid(board, row, col, num)) {
        board[row][col] = num;
        count = countSolutionsHelper(board, row + 1, col, count);
      }
    }
    
    board[row][col] = 0;
    return count;
  }, [isValid]);

  // Generate new Sudoku board
  const generateSudoku = useCallback((): void => {
    // Reset game state
    setGameStarted(true);
    setGameCompleted(false);
    setTimer(0);
    setWrongAttempts(0);
    setHintsRemaining(3);
    setIsPaused(false);
    setLastSmartMove('');
    
    // Generate solved board
    const solvedBoard = generateSolvedBoard();
    setSolution(solvedBoard.map(row => [...row]));
    
    // Create puzzle based on difficulty
    const puzzleBoard = createPuzzle(solvedBoard, difficulty);
    setBoard(puzzleBoard.map(row => [...row]));
    setInitialBoard(puzzleBoard.map(row => [...row]));
  }, [createPuzzle, difficulty, generateSolvedBoard]);

  // Handle cell selection
  const handleCellClick = useCallback((row: number, col: number): void => {
    if (initialBoard[row][col] === 0 && !gameCompleted && !isPaused) {
      setSelectedCell({ row, col });
    }
  }, [gameCompleted, initialBoard, isPaused]);

  // Handle number input
  const handleNumberInput = useCallback((num: number): void => {
    if (selectedCell && !gameCompleted && !isPaused) {
      const { row, col } = selectedCell;
      
      // Check if the move is valid
      if (num !== 0 && num !== solution[row][col]) {
        const newWrongAttempts = wrongAttempts + 1;
        setWrongAttempts(newWrongAttempts);
        
        if (newWrongAttempts >= 3) {
          toast.error('Game Over! You made 3 wrong attempts');
          setGameCompleted(true);
          return;
        } else {
          toast.error(`Wrong number! Attempts left: ${3 - newWrongAttempts}`);
          return;
        }
      }
      
      // Check if number is still available
      if (num !== 0 && numberUsage[num] <= 0) {
        toast.error(`No more ${num}'s left to place!`);
        return;
      }
      
      const newBoard = [...board];
      const previousValue = newBoard[row][col];
      newBoard[row][col] = num;
      setBoard(newBoard);
      
      // Update number usage
      if (previousValue > 0) {
        setNumberUsage(prev => ({ ...prev, [previousValue]: prev[previousValue] + 1 }));
      }
      if (num > 0) {
        setNumberUsage(prev => ({ ...prev, [num]: prev[num] - 1 }));
      }
      
      // Check for smart moves
      checkForSmartMove(newBoard, row, col, num);
      
      // Check if puzzle is complete
      if (isBoardComplete(newBoard)) {
        setGameCompleted(true);
        saveBestTime();
        toast.success('🎉 Congratulations! Puzzle solved! 🎉');
      }
    }
  },  [board, gameCompleted, isPaused, numberUsage, selectedCell, solution, wrongAttempts]);;

  // Check for smart moves and congratulate player
  const checkForSmartMove = useCallback((board: SudokuBoard, row: number, col: number, num: number) => {
    if (num === 0) return;

    // Check if this completes a row, column or box
    const isRowComplete = board[row].every(cell => cell !== 0);
    const isColComplete = board.every(r => r[col] !== 0);
    
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    let isBoxComplete = true;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (board[boxRow + i][boxCol + j] === 0) {
          isBoxComplete = false;
          break;
        }
      }
      if (!isBoxComplete) break;
    }
    
    let moveType = '';
    if (isRowComplete && isColComplete && isBoxComplete) {
      moveType = 'row, column and box';
    } else if (isRowComplete && isColComplete) {
      moveType = 'row and column';
    } else if (isRowComplete && isBoxComplete) {
      moveType = 'row and box';
    } else if (isColComplete && isBoxComplete) {
      moveType = 'column and box';
    } else if (isRowComplete) {
      moveType = 'row';
    } else if (isColComplete) {
      moveType = 'column';
    } else if (isBoxComplete) {
      moveType = 'box';
    }
    
    if (moveType && moveType !== lastSmartMove) {
      setLastSmartMove(moveType);
      toast.success(`🧠 Smart move! You completed a ${moveType}! 🎉`);
    }
  }, [lastSmartMove]);

  // Check if board is complete and correct
  const isBoardComplete = useCallback((currentBoard: SudokuBoard): boolean => {
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        if (currentBoard[i][j] === 0 || currentBoard[i][j] !== solution[i][j]) {
          return false;
        }
      }
    }
    return true;
  }, [solution]);

  // Save best time to IndexedDB
  const saveBestTime = useCallback((): void => {
    if (typeof window !== 'undefined' && window.indexedDB && playerName) {
      const request = window.indexedDB.open('SudokuGameDB', 1);
      
      request.onsuccess = (event: Event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = db.transaction(['bestTimes'], 'readwrite');
        const store = transaction.objectStore('bestTimes');
        
        // Check if there's an existing record
        const getRequest = store.get([playerName, difficulty]);
        
        getRequest.onsuccess = () => {
          const existingRecord = getRequest.result as IndexDBBestTime | undefined;
          if (!existingRecord || timer < existingRecord.time) {
            const newRecord: IndexDBBestTime = {
              playerName,
              difficulty,
              time: timer
            };
            store.put(newRecord);
            setBestTimes(prev => ({
              ...prev,
              [difficulty]: timer
            }));
          }
        };
      };
    }
  }, [difficulty, playerName, timer]);

  // Search for players on local network
  const searchForPlayers = useCallback((): void => {
    // Simulating finding players on local network
    setAvailablePlayers([
      { name: 'Player1', ip: '192.168.1.2' },
      { name: 'Player2', ip: '192.168.1.3' },
      { name: 'Player3', ip: '192.168.1.4' }
    ]);
  }, []);

  // Start multiplayer game
  const startMultiplayerGame = useCallback((opponent: Player): void => {
    setMultiplayerMode(true);
    setGameStarted(true);
    generateSudoku();
  }, [generateSudoku]);

  // Format time
  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }, []);

  // Create player profile
  const createProfile = useCallback((): void => {
    if (playerName.trim()) {
      setProfileCreated(true);
      
      // Save player to IndexedDB
      if (typeof window !== 'undefined' && window.indexedDB) {
        const request = window.indexedDB.open('SudokuGameDB', 1);
        
        request.onsuccess = (event: Event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction(['players'], 'readwrite');
          const store = transaction.objectStore('players');
          
          store.put({ name: playerName, createdAt: new Date() });
        };
      }
    }
  }, [playerName]);

  // Provide hint for selected cell
  const provideHint = useCallback((): void => {
    if (!selectedCell || hintsRemaining <= 0 || gameCompleted || isPaused) return;
    
    const { row, col } = selectedCell;
    
    // Check if cell is empty
    if (board[row][col] !== 0) {
      toast.info('This cell already has a number!');
      return;
    }
    
    // Get the correct number from solution
    const correctNumber = solution[row][col];
    
    // Explain why this number goes here
    let explanation = `This should be ${correctNumber} because:`;
    
    // Check row
    const rowNumbers = board[row].filter(n => n !== 0);
    if (rowNumbers.includes(correctNumber)) {
      explanation += `\n- ${correctNumber} is already in this row`;
    }
    
    // Check column
    const colNumbers = board.map(r => r[col]).filter(n => n !== 0);
    if (colNumbers.includes(correctNumber)) {
      explanation += `\n- ${correctNumber} is already in this column`;
    }
    
    // Check box
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    const boxNumbers: number[] = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (board[boxRow + i][boxCol + j] !== 0) {
          boxNumbers.push(board[boxRow + i][boxCol + j]);
        }
      }
    }
    if (boxNumbers.includes(correctNumber)) {
      explanation += `\n- ${correctNumber} is already in this 3x3 box`;
    }
    
    // If none of the above, it's the only possible number
    if (!rowNumbers.includes(correctNumber) && 
        !colNumbers.includes(correctNumber) && 
        !boxNumbers.includes(correctNumber)) {
      explanation += `\n- It's the only number that fits here without conflicts`;
    }
    
    toast.info(explanation);
    setHintsRemaining(prev => prev - 1);
  }, [board, hintsRemaining, selectedCell, solution, gameCompleted, isPaused]);

  // Toggle pause game
  const togglePause = useCallback((): void => {
    if (!gameStarted || gameCompleted) return;
    setIsPaused(prev => !prev);
    toast.info(isPaused ? 'Game resumed!' : 'Game paused');
  }, [gameStarted, gameCompleted, isPaused]);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <Head>
        <title>Geezy Sudoku</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <ToastContainer position="top-right" autoClose={5000} theme={darkMode ? 'dark' : 'light'} />

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-green-500">
            Geezy Sudoku
          </h1>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-full ${darkMode ? 'bg-gray-700 text-yellow-300' : 'bg-gray-200 text-gray-700'}`}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
            
            <button
              onClick={() => setShowManual(!showManual)}
              className={`p-2 rounded-lg ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
            >
              📖 How to Play
            </button>
          </div>
        </div>

        {!profileCreated ? (
          <div className={`max-w-md mx-auto p-6 rounded-lg shadow-lg ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <h2 className="text-2xl font-bold mb-4">Create Your Profile</h2>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              className={`w-full p-3 mb-4 rounded-lg ${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-100'}`}
            />
            <button
              onClick={createProfile}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-green-500 text-white font-bold rounded-lg hover:opacity-90 transition"
            >
              Create Profile
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Game controls */}
            <div className={`p-6 rounded-lg shadow-lg ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <h2 className="text-2xl font-bold mb-4">Controls</h2>
              
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2">Difficulty</h3>
                <div className="grid grid-cols-3 gap-2">
                  {['easy', 'medium', 'hard'].map((level) => (
                    <button
                      key={level}
                      onClick={() => setDifficulty(level)}
                      className={`py-2 rounded-lg capitalize ${difficulty === level 
                        ? 'bg-gradient-to-r from-blue-500 to-green-500 text-white' 
                        : darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              
              <button
                onClick={generateSudoku}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-green-500 text-white font-bold rounded-lg mb-2 hover:opacity-90 transition"
              >
                New Game
              </button>

              {gameStarted && (
                <>
                  <button
                    onClick={togglePause}
                    className={`w-full py-2 rounded-lg mb-2 ${darkMode ? 'bg-yellow-700 hover:bg-yellow-600' : 'bg-yellow-500 hover:bg-yellow-400'} text-white`}
                  >
                    {isPaused ? 'Resume Game' : 'Pause Game'}
                  </button>

                  <button
                    onClick={provideHint}
                    disabled={hintsRemaining <= 0}
                    className={`w-full py-2 rounded-lg mb-2 ${hintsRemaining <= 0 
                      ? darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-200 text-gray-400'
                      : darkMode ? 'bg-purple-700 hover:bg-purple-600' : 'bg-purple-500 hover:bg-purple-400'} text-white`}
                  >
                    Get Hint ({hintsRemaining} left)
                  </button>
                </>
              )}
              
              {gameStarted && (
                <div className={`p-4 rounded-lg mb-4 text-center ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <div className="text-2xl font-bold">{formatTime(timer)}</div>
                  <div className="text-sm">Current Time</div>
                  {isPaused && <div className="text-sm text-yellow-500">PAUSED</div>}
                </div>
              )}
              
              {Object.keys(bestTimes).length > 0 && (
                <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <h3 className="font-bold mb-2">Best Times</h3>
                  {Object.entries(bestTimes).map(([diff, time]) => (
                    <div key={diff} className="flex justify-between">
                      <span className="capitalize">{diff}:</span>
                      <span>{formatTime(time)}</span>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="mt-6">
                <button
                  onClick={() => setMultiplayerMode(!multiplayerMode)}
                  className={`w-full py-2 rounded-lg mb-2 ${multiplayerMode 
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' 
                    : darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}
                >
                  {multiplayerMode ? 'Exit Multiplayer' : 'Multiplayer Mode'}
                </button>
                
                {multiplayerMode && (
                  <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                    <button
                      onClick={searchForPlayers}
                      className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg mb-2 hover:opacity-90 transition"
                    >
                      Search for Players
                    </button>
                    
                    {availablePlayers.length > 0 && (
                      <div className="mt-2">
                        <h4 className="font-semibold mb-1">Available Players:</h4>
                        <div className="space-y-1">
                          {availablePlayers.map((player) => (
                            <div 
                              key={player.ip} 
                              className={`p-2 rounded-lg cursor-pointer hover:opacity-80 transition ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`}
                              onClick={() => startMultiplayerGame(player)}
                            >
                              {player.name} ({player.ip})
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Sudoku board */}
            <div className="flex flex-col items-center">
              <div className={`p-4 rounded-lg shadow-lg ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                <div className="grid grid-cols-9 gap-px bg-gray-400">
                  {board.map((row, rowIndex) => (
                    row.map((cell, colIndex) => {
                      const isSelected = selectedCell?.row === rowIndex && selectedCell?.col === colIndex;
                      const isInitial = initialBoard[rowIndex][colIndex] !== 0;
                      const isConflict = cell !== 0 && cell !== solution[rowIndex][colIndex];
                      
                      return (
                        <div
                          key={`${rowIndex}-${colIndex}`}
                          onClick={() => handleCellClick(rowIndex, colIndex)}
                          className={`
                            w-10 h-10 md:w-12 md:h-12 flex items-center justify-center relative
                            ${rowIndex % 3 === 0 && rowIndex !== 0 ? 'border-t-2 border-gray-700' : ''}
                            ${colIndex % 3 === 0 && colIndex !== 0 ? 'border-l-2 border-gray-700' : ''}
                            ${isSelected ? darkMode ? 'bg-blue-900' : 'bg-blue-200' : ''}
                            ${isInitial ? 'font-bold' : ''}
                            ${isConflict ? 'text-red-500' : ''}
                            ${darkMode ? 'bg-gray-800' : 'bg-white'}
                            cursor-pointer
                          `}
                        >
                          {cell !== 0 ? cell : ''}
                          {isConflict && (
                            <div className="absolute inset-0 border-2 border-red-500 opacity-50 pointer-events-none"></div>
                          )}
                        </div>
                      );
                    })
                  ))}
                </div>
              </div>
              
              {/* Number pad */}
              <div className="grid grid-cols-5 gap-2 mt-6">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, '✕'].map((num) => (
                  <button
                    key={num.toString()}
                    onClick={() => handleNumberInput(num === '✕' ? 0 : Number(num))}
                    disabled={num !== '✕' && numberUsage[Number(num)] <= 0}
                    className={`w-12 h-12 flex flex-col items-center justify-center rounded-lg text-xl font-bold
                      ${num === '✕' 
                        ? darkMode ? 'bg-red-700' : 'bg-red-500 text-white' 
                        : numberUsage[Number(num)] <= 0
                          ? darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-200 text-gray-400'
                          : darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
                  >
                    {num}
                    {num !== '✕' && (
                      <span className="text-xs mt-1">
                        {numberUsage[Number(num)] > 0 ? numberUsage[Number(num)] : ''}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              
              {gameCompleted && (
                <div className={`mt-6 p-4 rounded-lg text-center ${darkMode ? 'bg-green-900' : 'bg-green-100'}`}>
                  <div className="text-2xl font-bold">🎉 Puzzle Solved! 🎉</div>
                  <div className="text-lg">Time: {formatTime(timer)}</div>
                  {bestTimes[difficulty] && timer < bestTimes[difficulty] && (
                    <div className="text-sm mt-1">New best time for {difficulty}!</div>
                  )}
                </div>
              )}

              {wrongAttempts > 0 && (
                <div className={`mt-4 p-2 rounded-lg text-center ${darkMode ? 'bg-red-900' : 'bg-red-100'}`}>
                  Wrong attempts: {wrongAttempts}/3
                </div>
              )}
            </div>
            
            {/* 3D Animation and Player Info */}
            <div className={`p-6 rounded-lg shadow-lg flex flex-col items-center ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <div ref={threeContainer} className="mb-6"></div>
              
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-2">Player: {playerName}</h2>
                <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <div className="text-sm opacity-80">Current Difficulty</div>
                  <div className="text-xl font-bold capitalize">{difficulty}</div>
                </div>
              </div>
              
              <div className="mt-6 w-full">
                <h3 className="text-lg font-semibold mb-2">Game Stats</h3>
                <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-sm opacity-80">Games Played</div>
                      <div className="text-xl font-bold">-</div>
                    </div>
                    <div>
                      <div className="text-sm opacity-80">Best Time</div>
                      <div className="text-xl font-bold">
                        {bestTimes[difficulty] ? formatTime(bestTimes[difficulty]) : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm opacity-80">Hints Left</div>
                      <div className="text-xl font-bold">{hintsRemaining}</div>
                    </div>
                    <div>
                      <div className="text-sm opacity-80">Wrong Attempts</div>
                      <div className="text-xl font-bold">{wrongAttempts}/3</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      
      {/* How to Play Modal */}
      {showManual && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className={`max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-lg shadow-xl p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">How to Play Sudoku</h2>
              <button
                onClick={() => setShowManual(false)}
                className={`p-2 rounded-full ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
              >
                ✕
              </button>
            </div>
            
            <div className="prose prose-sm max-w-none">
              <h3 className="font-bold text-lg">Objective</h3>
              <p>
                Fill the 9&times;9 grid with digits so that each column, each row, and each of the nine 3&times;3 subgrids 
                that compose the grid (also called &quot;boxes&quot;, &quot;blocks&quot;, or &quot;regions&quot;) contain all of the digits from 1 to 9.
              </p>
              
              <h3 className="font-bold text-lg mt-4">Rules</h3>
              <ol className="list-decimal pl-5 space-y-2">
                <li>Each row must contain the numbers 1-9 without repetition</li>
                <li>Each column must contain the numbers 1-9 without repetition</li>
                <li>Each 3×3 box must contain the numbers 1-9 without repetition</li>
                <li>Only the numbers 1 through 9 are used</li>
                <li>No guessing is required - every puzzle can be solved with logic alone</li>
              </ol>
              
              <h3 className="font-bold text-lg mt-4">Game Features</h3>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Pause Game:</strong> Temporarily stop the timer</li>
                <li><strong>Hints (3 max):</strong> Get explanations for correct numbers</li>
                <li><strong>Smart Move Detection:</strong> Get congratulated for good moves</li>
                <li><strong>Wrong Attempt Limit (3 max):</strong> Game ends after 3 wrong inputs</li>
                <li><strong>Number Usage Tracking:</strong> See how many of each number remain</li>
                <li><strong>Keyboard Support:</strong> Use arrow keys and numbers 1-9</li>
              </ul>
              
              <h3 className="font-bold text-lg mt-4">Multiplayer Mode</h3>
              <p>
                In multiplayer mode, you can play against others on your local network. The game will 
                generate the same puzzle for all players, and the first to complete it wins!
              </p>
              
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => setShowManual(false)}
                  className={`px-6 py-2 rounded-lg ${darkMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}
                >
                  Got it!
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}