import { MotionConfig } from "framer-motion";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

import CreateRoom from "@/pages/CreateRoom";
import JoinRoom from "@/pages/JoinRoom";
import Room from "@/pages/Room";

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<CreateRoom />} />
          <Route path="/j/:code" element={<JoinRoom />} />
          <Route path="/room/:id" element={<Room />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-center" toastOptions={{ className: "font-sans" }} />
      </BrowserRouter>
    </MotionConfig>
  );
}
