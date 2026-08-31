import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const queryClient = new QueryClient();
function App() { return ( <QueryClientProvider client={queryClient}> <BrowserRouter> <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4"> <Routes> <Route path="/" element={ <div className="bg-white p-8 rounded shadow-md max-w-md w-full"> <h1 className="text-2xl font-bold mb-4 text-center text-blue-600">AutoApply Web</h1> <p className="text-gray-700 text-center">React + Vite + Tailwind CSS shell initialized.</p> </div> } /> </Routes> </div> </BrowserRouter> </QueryClientProvider> ); }
export default App;
