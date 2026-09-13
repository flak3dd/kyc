import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Verify from "./pages/Verify";
import LivenessWidget from "./pages/LivenessWidget";
import DisplayProbe from "./pages/DisplayProbe";
import FingerprintProbe from "./pages/FingerprintProbe";
import Console from "./pages/Console";
import ShareView from "./pages/ShareView";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/verify/liveness-widget" element={<LivenessWidget />} />
          <Route path="/probes/display" element={<DisplayProbe />} />
          <Route path="/probes/fingerprint" element={<FingerprintProbe />} />
          <Route path="/console" element={<Console />} />
          <Route path="/share/:id" element={<ShareView />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
