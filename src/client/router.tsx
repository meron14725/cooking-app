import { createBrowserRouter } from 'react-router'
import { Layout } from './components/Layout'
import { FridgePage } from './routes/FridgePage'
import { HomePage } from './routes/HomePage'
import { MorePage } from './routes/MorePage'
import { NotFoundPage } from './routes/NotFoundPage'
import { PlanPage } from './routes/PlanPage'
import { RecipesPage } from './routes/RecipesPage'

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'fridge', element: <FridgePage /> },
      { path: 'plan', element: <PlanPage /> },
      { path: 'recipes', element: <RecipesPage /> },
      { path: 'more', element: <MorePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
