import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import MenuPage from "./pages/MenuPage";

const menuQueryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

function MenuRouter() {
  return (
    <Switch>
      <Route path="/" component={MenuPage} />
      <Route component={MenuPage} />
    </Switch>
  );
}

export default function Menu() {
  return (
    <QueryClientProvider client={menuQueryClient}>
      <TooltipProvider>
        <WouterRouter base="/menu">
          <MenuRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
