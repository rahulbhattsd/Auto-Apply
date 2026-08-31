import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const queryClient = new QueryClient();
function App() { return (_jsxs(QueryClientProvider, { client: queryClient, children: [" ", _jsxs(BrowserRouter, { children: [" ", _jsxs("div", { className: "min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4", children: [" ", _jsxs(Routes, { children: [" ", _jsx(Route, { path: "/", element: _jsxs("div", { className: "bg-white p-8 rounded shadow-md max-w-md w-full", children: [" ", _jsx("h1", { className: "text-2xl font-bold mb-4 text-center text-blue-600", children: "AutoApply Web" }), " ", _jsx("p", { className: "text-gray-700 text-center", children: "React + Vite + Tailwind CSS shell initialized." }), " "] }) }), " "] }), " "] }), " "] }), " "] })); }
export default App;
