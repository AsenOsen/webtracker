import { useParams } from 'react-router-dom'


const Main = () => {
    fetch("/snapshot/" + useParams().key)
    return Loading...
}

export default Main;