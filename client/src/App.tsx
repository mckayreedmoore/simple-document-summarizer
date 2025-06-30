import ChatArea from './components/chatArea';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function App() {
  return (
    <div className='flex min-h-screen w-full flex-col items-center justify-center bg-zinc-900'>
      <ChatArea />
      <ToastContainer
        position='top-right'
        autoClose={false} 
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme='dark'
        toastClassName='bg-zinc-900 text-zinc-100 rounded-lg shadow-lg border border-zinc-700 px-6 py-4 min-h-[2.5rem] text-base min-w-[14rem] max-w-md' // Smaller text and padding
        progressClassName='!bg-red-600 !rounded-b'
      />
    </div>
  );
}

export default App;
