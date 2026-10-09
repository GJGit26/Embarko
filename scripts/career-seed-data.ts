// Curated catalog: skills, the roles they lead to, and practical projects.
// Seeded by `npm run seed:career` (idempotent upsert). Edit freely and re-run.
//
//  - skills.implies: relationships used for role matching, e.g. selecting
//    React also counts as knowing JavaScript. Curated, not inferred by an LLM.
//  - role skills: importance 3 = core, 2 = expected, 1 = nice to have. The
//    category key becomes the "Frontend / Backend / ..." row in Job Readiness.
//  - project milestones each map to >=1 skill; finishing a milestone creates
//    evidence for exactly those skills.

type Level = "Beginner" | "Intermediate" | "Advanced";
type Importance = 1 | 2 | 3;

export interface SeedSkill {
  slug: string;
  name: string;
  category: "Language" | "Framework" | "Database" | "Tool" | "Concept";
  aliases?: string[];
  implies?: string[];
}

export interface SeedRole {
  slug: string;
  name: string;
  description: string;
  domain: string; // must match INTEREST_DOMAINS in lib/types.ts
  difficulty: Level;
  skills: Record<string, [string, Importance][]>;
}

export interface SeedProject {
  slug: string;
  name: string;
  description: string;
  difficulty: Level;
  estimatedHours: number;
  prerequisites: string[];
  expectedOutcome: string;
  roles: string[];
  milestones: { title: string; description: string; skills: string[] }[];
}

const skills: SeedSkill[] = [
  // Web
  { slug: "html", name: "HTML", category: "Language", aliases: ["html5"] },
  { slug: "css", name: "CSS", category: "Language", aliases: ["css3", "tailwind", "tailwind css"] },
  { slug: "javascript", name: "JavaScript", category: "Language", aliases: ["js", "es6", "ecmascript"] },
  { slug: "typescript", name: "TypeScript", category: "Language", aliases: ["ts"], implies: ["javascript"] },
  { slug: "react", name: "React", category: "Framework", aliases: ["reactjs", "react.js"], implies: ["javascript"] },
  { slug: "nextjs", name: "Next.js", category: "Framework", aliases: ["next", "next.js"], implies: ["react", "javascript"] },
  { slug: "state-management", name: "State Management", category: "Concept", aliases: ["redux", "zustand", "context api"] },
  { slug: "nodejs", name: "Node.js", category: "Framework", aliases: ["node", "node.js"], implies: ["javascript"] },
  { slug: "express", name: "Express", category: "Framework", aliases: ["expressjs", "express.js"], implies: ["nodejs", "javascript"] },
  { slug: "rest-api", name: "REST APIs", category: "Concept", aliases: ["rest", "api design", "restful api"] },
  { slug: "jwt", name: "JWT Authentication", category: "Concept", aliases: ["jwt", "authentication", "auth", "oauth"] },
  { slug: "websockets", name: "WebSockets", category: "Concept", aliases: ["socket.io", "websocket"] },
  { slug: "testing", name: "Testing", category: "Concept", aliases: ["jest", "unit testing", "vitest", "pytest"] },
  { slug: "deployment", name: "Deployment", category: "Concept", aliases: ["vercel", "render", "netlify", "hosting"] },
  { slug: "system-design", name: "System Design", category: "Concept", aliases: ["architecture"] },
  { slug: "dsa", name: "Data Structures & Algorithms", category: "Concept", aliases: ["data structures", "algorithms", "dsa", "leetcode"] },
  // Data / ML / AI
  { slug: "sql", name: "SQL", category: "Language", aliases: ["mysql", "sqlite"] },
  { slug: "postgresql", name: "PostgreSQL", category: "Database", aliases: ["postgres", "psql"], implies: ["sql"] },
  { slug: "mongodb", name: "MongoDB", category: "Database", aliases: ["mongo", "mongoose"] },
  { slug: "python", name: "Python", category: "Language", aliases: ["py"] },
  { slug: "pandas", name: "Pandas", category: "Framework", aliases: [], implies: ["python"] },
  { slug: "numpy", name: "NumPy", category: "Framework", aliases: [], implies: ["python"] },
  { slug: "statistics", name: "Statistics", category: "Concept", aliases: ["probability", "stats"] },
  { slug: "data-visualization", name: "Data Visualization", category: "Concept", aliases: ["matplotlib", "seaborn", "tableau", "power bi", "plotly"] },
  { slug: "machine-learning", name: "Machine Learning", category: "Concept", aliases: ["ml"] },
  { slug: "scikit-learn", name: "Scikit-learn", category: "Framework", aliases: ["sklearn", "scikit learn"], implies: ["python", "machine-learning"] },
  { slug: "deep-learning", name: "Deep Learning", category: "Concept", aliases: ["neural networks", "dl"], implies: ["machine-learning"] },
  { slug: "tensorflow", name: "TensorFlow", category: "Framework", aliases: ["keras"], implies: ["python", "deep-learning"] },
  { slug: "pytorch", name: "PyTorch", category: "Framework", aliases: ["torch"], implies: ["python", "deep-learning"] },
  { slug: "llm-apis", name: "LLM APIs", category: "Concept", aliases: ["openai api", "gemini api", "claude api", "llm", "langchain"] },
  { slug: "prompt-engineering", name: "Prompt Engineering", category: "Concept", aliases: ["prompting"] },
  { slug: "rag", name: "RAG", category: "Concept", aliases: ["retrieval augmented generation", "retrieval-augmented generation"], implies: ["llm-apis"] },
  { slug: "vector-databases", name: "Vector Databases", category: "Database", aliases: ["pgvector", "pinecone", "chroma", "embeddings"] },
  // Mobile
  { slug: "react-native", name: "React Native", category: "Framework", aliases: ["rn", "expo"], implies: ["react", "javascript"] },
  { slug: "firebase", name: "Firebase", category: "Tool", aliases: ["firestore"] },
  // Tools / infra / security
  { slug: "git", name: "Git & GitHub", category: "Tool", aliases: ["github", "version control", "git"] },
  { slug: "docker", name: "Docker", category: "Tool", aliases: ["containers"] },
  { slug: "linux", name: "Linux", category: "Tool", aliases: ["ubuntu", "unix"] },
  { slug: "bash", name: "Bash Scripting", category: "Language", aliases: ["shell", "shell scripting"], implies: ["linux"] },
  { slug: "ci-cd", name: "CI/CD", category: "Concept", aliases: ["github actions", "jenkins", "gitlab ci"] },
  { slug: "aws", name: "AWS", category: "Tool", aliases: ["amazon web services", "cloud"] },
  { slug: "kubernetes", name: "Kubernetes", category: "Tool", aliases: ["k8s"], implies: ["docker"] },
  { slug: "terraform", name: "Terraform", category: "Tool", aliases: ["infrastructure as code", "iac"] },
  { slug: "networking", name: "Networking", category: "Concept", aliases: ["tcp/ip", "computer networks", "http"] },
  { slug: "owasp", name: "Web Security (OWASP)", category: "Concept", aliases: ["owasp top 10", "web security", "appsec"] },
  { slug: "cryptography", name: "Cryptography Basics", category: "Concept", aliases: ["crypto", "encryption"] },
];

const roles: SeedRole[] = [
  {
    slug: "frontend-developer",
    name: "Frontend Developer",
    description: "Builds the interfaces users see and touch: responsive layouts, component-driven UIs, and the client-side logic behind them.",
    domain: "Web Development",
    difficulty: "Beginner",
    skills: {
      Frontend: [["html", 3], ["css", 3], ["javascript", 3], ["react", 3], ["state-management", 2], ["typescript", 1]],
      Backend: [["rest-api", 2]],
      Tools: [["git", 2], ["testing", 1]],
    },
  },
  {
    slug: "web-developer",
    name: "Web Developer",
    description: "Builds and maintains websites and web apps across the browser and a simple backend.",
    domain: "Web Development",
    difficulty: "Beginner",
    skills: {
      Frontend: [["html", 3], ["css", 3], ["javascript", 3], ["react", 2]],
      Backend: [["nodejs", 1], ["rest-api", 1]],
      Tools: [["git", 2], ["deployment", 1]],
    },
  },
  {
    slug: "react-developer",
    name: "React Developer",
    description: "Specialises in React applications: component design, hooks, state management, and testing of production UIs.",
    domain: "Web Development",
    difficulty: "Intermediate",
    skills: {
      React: [["react", 3], ["javascript", 3], ["state-management", 2], ["typescript", 2], ["nextjs", 1]],
      Foundations: [["html", 1], ["css", 1]],
      Backend: [["rest-api", 2]],
      Tools: [["testing", 2], ["git", 2]],
    },
  },
  {
    slug: "mern-stack-developer",
    name: "MERN Stack Developer",
    description: "Builds complete applications with MongoDB, Express, React and Node.js, end to end.",
    domain: "Web Development",
    difficulty: "Intermediate",
    skills: {
      Frontend: [["react", 3], ["javascript", 3]],
      Backend: [["nodejs", 3], ["express", 3], ["rest-api", 2]],
      Database: [["mongodb", 3]],
      Authentication: [["jwt", 2]],
      Tools: [["git", 2], ["deployment", 1]],
    },
  },
  {
    slug: "full-stack-developer",
    name: "Full Stack Developer",
    description: "Owns features across the stack: UI, APIs, databases, authentication, and shipping to production.",
    domain: "Web Development",
    difficulty: "Intermediate",
    skills: {
      Frontend: [["html", 2], ["css", 2], ["javascript", 3], ["react", 3], ["nextjs", 1]],
      Backend: [["nodejs", 3], ["express", 2], ["rest-api", 3]],
      Database: [["mongodb", 2], ["postgresql", 2]],
      Authentication: [["jwt", 3]],
      DSA: [["dsa", 2]],
      Tools: [["git", 2], ["docker", 1], ["testing", 2], ["deployment", 1]],
      "System Design": [["system-design", 1]],
    },
  },
  {
    slug: "backend-developer",
    name: "Backend Developer",
    description: "Designs and builds the services, APIs and data layers that power applications.",
    domain: "Web Development",
    difficulty: "Intermediate",
    skills: {
      Backend: [["nodejs", 3], ["express", 3], ["rest-api", 3]],
      Database: [["postgresql", 3], ["mongodb", 2]],
      Authentication: [["jwt", 3]],
      Tools: [["docker", 2], ["testing", 2], ["git", 2]],
      "System Design": [["system-design", 2]],
    },
  },
  {
    slug: "mobile-app-developer",
    name: "Mobile App Developer",
    description: "Builds cross-platform mobile apps with React Native and a managed backend.",
    domain: "App Development",
    difficulty: "Intermediate",
    skills: {
      Mobile: [["react-native", 3], ["react", 3], ["javascript", 3], ["state-management", 2]],
      Backend: [["firebase", 2], ["rest-api", 2]],
      Tools: [["git", 2], ["testing", 1]],
    },
  },
  {
    slug: "data-analyst",
    name: "Data Analyst",
    description: "Turns raw data into answers: cleaning, querying, analysing and visualising for decision makers.",
    domain: "Machine Learning",
    difficulty: "Beginner",
    skills: {
      Programming: [["python", 3], ["pandas", 3], ["numpy", 2]],
      Database: [["sql", 3]],
      Analysis: [["statistics", 2], ["data-visualization", 2]],
      Tools: [["git", 1]],
    },
  },
  {
    slug: "machine-learning-engineer",
    name: "Machine Learning Engineer",
    description: "Trains, evaluates and ships machine-learning models as reliable production components.",
    domain: "Machine Learning",
    difficulty: "Advanced",
    skills: {
      Programming: [["python", 3], ["numpy", 2], ["pandas", 2]],
      "ML Core": [["machine-learning", 3], ["scikit-learn", 3], ["statistics", 2]],
      "Deep Learning": [["tensorflow", 2], ["pytorch", 2], ["deep-learning", 2]],
      Tools: [["docker", 1], ["git", 1]],
    },
  },
  {
    slug: "data-scientist",
    name: "Data Scientist",
    description: "Combines statistics, programming and domain knowledge to model data and communicate findings.",
    domain: "Machine Learning",
    difficulty: "Intermediate",
    skills: {
      Programming: [["python", 3], ["pandas", 3], ["numpy", 2]],
      Database: [["sql", 2]],
      "ML Core": [["machine-learning", 2], ["scikit-learn", 3]],
      Analysis: [["statistics", 3], ["data-visualization", 2]],
    },
  },
  {
    slug: "ai-engineer",
    name: "AI Engineer",
    description: "Builds applications on top of LLMs: retrieval pipelines, prompts, evaluation and APIs.",
    domain: "Machine Learning",
    difficulty: "Advanced",
    skills: {
      Programming: [["python", 3]],
      "LLM Apps": [["llm-apis", 3], ["rag", 3], ["prompt-engineering", 2], ["vector-databases", 2]],
      "ML Core": [["deep-learning", 2]],
      Backend: [["rest-api", 2]],
      Tools: [["git", 1]],
    },
  },
  {
    slug: "devops-engineer",
    name: "DevOps Engineer",
    description: "Automates how software is built, deployed and operated: containers, pipelines and cloud infrastructure.",
    domain: "Cloud & DevOps",
    difficulty: "Intermediate",
    skills: {
      Systems: [["linux", 3], ["bash", 2], ["networking", 2]],
      Containers: [["docker", 3], ["kubernetes", 2]],
      Automation: [["ci-cd", 3], ["terraform", 1]],
      Cloud: [["aws", 3]],
      Tools: [["git", 2]],
    },
  },
  {
    slug: "security-analyst",
    name: "Security Analyst",
    description: "Finds and fixes weaknesses in systems and web apps, and monitors for threats.",
    domain: "Cybersecurity",
    difficulty: "Intermediate",
    skills: {
      Foundations: [["networking", 3], ["linux", 3]],
      "Application Security": [["owasp", 3], ["cryptography", 2]],
      Scripting: [["python", 2], ["bash", 1]],
      Tools: [["git", 1]],
    },
  },
];

const projects: SeedProject[] = [
  {
    slug: "todo-application",
    name: "Todo Application",
    description: "A full-stack task manager: add, complete and delete tasks that persist in a database.",
    difficulty: "Beginner",
    estimatedHours: 12,
    prerequisites: ["HTML & CSS basics", "JavaScript fundamentals"],
    expectedOutcome: "A deployed CRUD app with a React front end and a Node/Express API you can show in an interview.",
    roles: ["full-stack-developer", "mern-stack-developer", "frontend-developer", "react-developer"],
    milestones: [
      { title: "Set up the React project", description: "Scaffold the app, commit to Git and push to GitHub.", skills: ["react", "git"] },
      { title: "Build the task list UI", description: "Responsive layout with an input, list and filters.", skills: ["html", "css", "react"] },
      { title: "Add, complete and delete tasks", description: "Manage task state in React.", skills: ["react", "state-management"] },
      { title: "Create the REST API", description: "Express endpoints for tasks (GET/POST/PATCH/DELETE).", skills: ["nodejs", "express", "rest-api"] },
      { title: "Persist tasks in MongoDB", description: "Replace in-memory storage with a MongoDB collection.", skills: ["mongodb"] },
      { title: "Deploy it", description: "Ship front end and API to a free host and share the URL.", skills: ["deployment"] },
    ],
  },
  {
    slug: "job-tracker",
    name: "Job Tracker",
    description: "Track job applications through stages (applied, interview, offer) with per-user accounts.",
    difficulty: "Intermediate",
    estimatedHours: 30,
    prerequisites: ["React basics", "Node.js and Express basics"],
    expectedOutcome: "An authenticated multi-user app with a REST API and MongoDB storage, deployed publicly.",
    roles: ["full-stack-developer", "mern-stack-developer", "backend-developer", "react-developer"],
    milestones: [
      { title: "Set up React", description: "Project scaffold, routing and Git workflow.", skills: ["react", "git"] },
      { title: "Create the UI", description: "Board and form components with shared state.", skills: ["react", "css", "state-management"] },
      { title: "Implement authentication", description: "Register/login with hashed passwords and JWT; protect routes on client and server.", skills: ["jwt", "express", "nodejs"] },
      { title: "Build the REST API", description: "Validated CRUD endpoints scoped to the logged-in user.", skills: ["rest-api", "express", "nodejs"] },
      { title: "Integrate MongoDB", description: "Model applications and users; index and query.", skills: ["mongodb"] },
      { title: "Deploy", description: "Deploy with environment variables and a production database.", skills: ["deployment", "git"] },
    ],
  },
  {
    slug: "realtime-collaboration-platform",
    name: "Real-Time Collaboration Platform",
    description: "A shared workspace where several users edit and see updates live, with rooms and persistence.",
    difficulty: "Advanced",
    estimatedHours: 60,
    prerequisites: ["A completed full-stack project", "Comfort with async JavaScript"],
    expectedOutcome: "A containerised, tested real-time app that demonstrates scaling and consistency trade-offs.",
    roles: ["full-stack-developer", "backend-developer", "mern-stack-developer"],
    milestones: [
      { title: "Design the architecture", description: "Write a short design doc: rooms, events, data model, scaling limits.", skills: ["system-design"] },
      { title: "WebSocket server", description: "Rooms, presence and broadcast events.", skills: ["websockets", "nodejs"] },
      { title: "Live client", description: "React client that applies remote updates to local state.", skills: ["react", "state-management", "websockets"] },
      { title: "Persist to PostgreSQL", description: "Store documents and history; handle reconnects.", skills: ["postgresql", "rest-api"] },
      { title: "Test the critical paths", description: "Unit and integration tests for event handling.", skills: ["testing"] },
      { title: "Containerise and deploy", description: "Dockerfile, environment config and a public deployment.", skills: ["docker", "deployment"] },
    ],
  },
  {
    slug: "rest-api-service",
    name: "Bookstore REST API",
    description: "A well-structured API for a bookstore with accounts, roles and a relational database.",
    difficulty: "Intermediate",
    estimatedHours: 25,
    prerequisites: ["Node.js basics", "SQL basics"],
    expectedOutcome: "A documented, tested and containerised API with authentication and role-based access.",
    roles: ["backend-developer", "full-stack-developer"],
    milestones: [
      { title: "Model the data in PostgreSQL", description: "Tables for books, authors, orders; foreign keys and indexes.", skills: ["postgresql", "sql"] },
      { title: "Build the endpoints", description: "Resource-oriented routes with validation and pagination.", skills: ["express", "nodejs", "rest-api"] },
      { title: "Add JWT auth and roles", description: "Register/login; admin-only routes.", skills: ["jwt"] },
      { title: "Write tests", description: "Integration tests against a test database.", skills: ["testing"] },
      { title: "Dockerise", description: "Compose file with the API and database.", skills: ["docker", "git"] },
    ],
  },
  {
    slug: "portfolio-site",
    name: "Personal Portfolio Site",
    description: "A fast, responsive portfolio that presents your projects and links to your GitHub.",
    difficulty: "Beginner",
    estimatedHours: 8,
    prerequisites: ["Basic HTML"],
    expectedOutcome: "A live portfolio URL you can put on your résumé.",
    roles: ["frontend-developer"],
    milestones: [
      { title: "Structure the page in semantic HTML", description: "Sections for about, projects and contact.", skills: ["html"] },
      { title: "Style it responsively", description: "Flexbox/Grid layout that works on phones.", skills: ["css"] },
      { title: "Add interactivity", description: "Theme toggle, filtering projects with vanilla JS.", skills: ["javascript"] },
      { title: "Publish with Git", description: "Commit history and a hosted version.", skills: ["git", "deployment"] },
    ],
  },
  {
    slug: "api-driven-dashboard",
    name: "API-Driven Dashboard",
    description: "A typed React dashboard that fetches, caches and visualises data from a public API.",
    difficulty: "Intermediate",
    estimatedHours: 20,
    prerequisites: ["React basics", "Fetch/async JavaScript"],
    expectedOutcome: "A tested TypeScript React app with loading, error and empty states handled.",
    roles: ["frontend-developer", "react-developer"],
    milestones: [
      { title: "Set up React with TypeScript", description: "Typed project scaffold.", skills: ["react", "typescript"] },
      { title: "Fetch and display data", description: "Consume a REST API with proper loading/error states.", skills: ["rest-api", "react", "javascript"] },
      { title: "Share state across views", description: "Lift state or introduce a store; avoid prop drilling.", skills: ["state-management"] },
      { title: "Test components", description: "Component tests for the key behaviours.", skills: ["testing", "react"] },
      { title: "Deploy", description: "Publish and document the project.", skills: ["deployment", "git"] },
    ],
  },
  {
    slug: "algorithms-toolkit",
    name: "Algorithms Toolkit",
    description: "A tested library of core data structures and algorithms with complexity notes.",
    difficulty: "Beginner",
    estimatedHours: 15,
    prerequisites: ["JavaScript fundamentals"],
    expectedOutcome: "A repo of implemented and tested structures you can walk through in interviews.",
    roles: ["full-stack-developer", "backend-developer", "frontend-developer"],
    milestones: [
      { title: "Implement stacks, queues and linked lists", description: "With tests and Big-O notes.", skills: ["dsa", "javascript"] },
      { title: "Implement hash maps and trees", description: "Include traversal and lookup.", skills: ["dsa"] },
      { title: "Sorting and searching", description: "Several algorithms compared on real inputs.", skills: ["dsa", "testing"] },
      { title: "Publish with documentation", description: "README with complexity table; clean Git history.", skills: ["git"] },
    ],
  },
  {
    slug: "mobile-expense-tracker",
    name: "Mobile Expense Tracker",
    description: "A cross-platform app to log and categorise expenses with cloud sync.",
    difficulty: "Intermediate",
    estimatedHours: 28,
    prerequisites: ["React basics"],
    expectedOutcome: "A working React Native app running on a device with cloud-synced data.",
    roles: ["mobile-app-developer"],
    milestones: [
      { title: "Scaffold the app", description: "Expo project and navigation.", skills: ["react-native", "git"] },
      { title: "Expense list and form", description: "Components and local state.", skills: ["react", "state-management"] },
      { title: "Sync with Firebase", description: "Auth and Firestore storage.", skills: ["firebase"] },
      { title: "Fetch exchange rates", description: "Consume a REST API.", skills: ["rest-api", "javascript"] },
      { title: "Test and release a build", description: "Component tests and a shareable build.", skills: ["testing"] },
    ],
  },
  {
    slug: "sales-data-analysis",
    name: "Sales Data Analysis",
    description: "Clean a messy sales dataset, answer business questions with SQL and Pandas, and present the findings.",
    difficulty: "Beginner",
    estimatedHours: 15,
    prerequisites: ["Python basics"],
    expectedOutcome: "A notebook and short report with cleaned data, queries and charts.",
    roles: ["data-analyst", "data-scientist"],
    milestones: [
      { title: "Clean the dataset", description: "Handle missing values, types and duplicates with Pandas.", skills: ["python", "pandas"] },
      { title: "Query it with SQL", description: "Aggregations and joins answering real questions.", skills: ["sql"] },
      { title: "Summarise statistically", description: "Distributions, correlations and a hypothesis check.", skills: ["statistics", "numpy"] },
      { title: "Visualise the findings", description: "Charts with labelled takeaways.", skills: ["data-visualization"] },
    ],
  },
  {
    slug: "house-price-predictor",
    name: "House Price Predictor",
    description: "Build and evaluate a regression model on a housing dataset with honest validation.",
    difficulty: "Intermediate",
    estimatedHours: 25,
    prerequisites: ["Pandas basics", "Basic statistics"],
    expectedOutcome: "A reproducible notebook comparing models with cross-validated metrics.",
    roles: ["machine-learning-engineer", "data-scientist"],
    milestones: [
      { title: "Explore and prepare the data", description: "EDA, encoding and train/test split.", skills: ["python", "pandas", "statistics"] },
      { title: "Train baseline models", description: "Linear and tree-based regressors.", skills: ["scikit-learn", "machine-learning"] },
      { title: "Validate properly", description: "Cross-validation, metrics and overfitting checks.", skills: ["machine-learning", "statistics"] },
      { title: "Document and version it", description: "README, requirements and Git history.", skills: ["git"] },
    ],
  },
  {
    slug: "image-classifier",
    name: "Image Classifier",
    description: "Train a CNN to classify images and serve predictions from a container.",
    difficulty: "Advanced",
    estimatedHours: 35,
    prerequisites: ["scikit-learn basics", "NumPy"],
    expectedOutcome: "A trained model with an evaluation report and a containerised inference script.",
    roles: ["machine-learning-engineer", "ai-engineer"],
    milestones: [
      { title: "Prepare the image data", description: "Loading, augmentation and splits.", skills: ["python", "numpy"] },
      { title: "Train a CNN", description: "Build and train a baseline network.", skills: ["tensorflow", "deep-learning"] },
      { title: "Evaluate and improve", description: "Confusion matrix and targeted improvements.", skills: ["machine-learning", "deep-learning"] },
      { title: "Package for inference", description: "Dockerised prediction script.", skills: ["docker"] },
    ],
  },
  {
    slug: "rag-docs-chatbot",
    name: "RAG Documentation Chatbot",
    description: "Answer questions about a document set using embeddings, retrieval and an LLM, with citations.",
    difficulty: "Advanced",
    estimatedHours: 40,
    prerequisites: ["Python", "REST APIs"],
    expectedOutcome: "A deployed Q&A API that cites its sources and has a small evaluation set.",
    roles: ["ai-engineer"],
    milestones: [
      { title: "Chunk and embed documents", description: "Chunking strategy and embeddings.", skills: ["python", "vector-databases"] },
      { title: "Retrieve relevant context", description: "Vector search with filters.", skills: ["vector-databases", "rag"] },
      { title: "Generate grounded answers", description: "Prompt the LLM with retrieved context and structured output.", skills: ["llm-apis", "prompt-engineering"] },
      { title: "Expose it as an API", description: "Endpoint with input validation and error handling.", skills: ["rest-api"] },
      { title: "Evaluate it", description: "A test set measuring retrieval and answer quality.", skills: ["rag"] },
    ],
  },
  {
    slug: "ci-cd-pipeline",
    name: "Containerised CI/CD Pipeline",
    description: "Automate build, test and deploy of a small app to the cloud on every push.",
    difficulty: "Intermediate",
    estimatedHours: 20,
    prerequisites: ["Git", "Basic Linux"],
    expectedOutcome: "A repository whose pushes automatically test, build an image and deploy it.",
    roles: ["devops-engineer"],
    milestones: [
      { title: "Containerise the app", description: "Write a Dockerfile and run it locally.", skills: ["docker", "linux"] },
      { title: "Script the build", description: "Bash helpers for build and smoke tests.", skills: ["bash"] },
      { title: "Automate with CI", description: "Pipeline running tests and building the image on push.", skills: ["ci-cd", "git"] },
      { title: "Deploy to the cloud", description: "Push the image and run it on AWS.", skills: ["aws"] },
    ],
  },
  {
    slug: "kubernetes-deployment",
    name: "Kubernetes Deployment with IaC",
    description: "Provision infrastructure with Terraform and run a multi-service app on Kubernetes.",
    difficulty: "Advanced",
    estimatedHours: 40,
    prerequisites: ["Docker", "A CI/CD pipeline"],
    expectedOutcome: "Reproducible infrastructure and a scaling, self-healing deployment.",
    roles: ["devops-engineer"],
    milestones: [
      { title: "Define infrastructure as code", description: "Terraform for network and compute.", skills: ["terraform", "aws"] },
      { title: "Write Kubernetes manifests", description: "Deployments, services and config.", skills: ["kubernetes", "docker"] },
      { title: "Add health checks and scaling", description: "Probes and autoscaling.", skills: ["kubernetes", "networking"] },
      { title: "Wire it into CI/CD", description: "Automated rollout on merge.", skills: ["ci-cd"] },
    ],
  },
  {
    slug: "web-vulnerability-lab",
    name: "Web Vulnerability Lab",
    description: "Find and fix common web vulnerabilities in an intentionally vulnerable practice app that you run locally.",
    difficulty: "Intermediate",
    estimatedHours: 20,
    prerequisites: ["HTTP basics", "Basic Linux"],
    expectedOutcome: "A written report of findings with fixes mapped to the OWASP Top 10.",
    roles: ["security-analyst"],
    milestones: [
      { title: "Set up the lab safely", description: "Run a practice app locally on an isolated network.", skills: ["linux", "networking"] },
      { title: "Identify OWASP Top 10 issues", description: "Document each issue with evidence.", skills: ["owasp"] },
      { title: "Apply fixes and re-test", description: "Patch and verify each vulnerability.", skills: ["owasp", "python"] },
      { title: "Review how secrets are protected", description: "Hashing, encryption and key handling.", skills: ["cryptography"] },
    ],
  },
];

export const CAREER_SEED = { skills, roles, projects };
