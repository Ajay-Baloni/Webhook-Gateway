import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Overview } from './pages/Overview';
import { Events } from './pages/Events';
import { EventDetail } from './pages/EventDetail';
import { DeadLetterQueue } from './pages/DeadLetterQueue';
import { SourcesDestinations } from './pages/SourcesDestinations';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Overview />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/:eventId" element={<EventDetail />} />
        <Route path="/dlq" element={<DeadLetterQueue />} />
        <Route path="/sources" element={<SourcesDestinations />} />
      </Route>
    </Routes>
  );
}
